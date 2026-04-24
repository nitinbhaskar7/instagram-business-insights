import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import path from 'path'
import axios from 'axios'
import fs from 'fs'
import Groq from 'groq-sdk'
import { containsProfanity } from 'better-profane-words'
import { performanceVelocity, viralityScore, weightedEngagement } from '../utils/helpers.js'


dotenv.config()

const app = express()
const port = 3000

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const groq = new Groq();



app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.get("/privacy_policy", (req, res) => {
  res.sendFile("privacy_policy.html", { root: path.join(process.cwd(), "public") });
});


app.all("/webhook", async (req, res) => {
  if (req.method === "POST") {
    try {
      console.log(JSON.stringify(req.body, null, 4));

      if (req.body.object === "instagram") {
        req.body.entry.forEach((entry) => {

          if (entry.messaging) {
            entry.messaging.forEach(async (event) => {
              try {
                if (event.message && event.message.text) {
                  console.log("DM received:");
                  console.log("Sender ID:", event.sender.id);
                  console.log("Message:", event.message.text);
                  // Do not reply for is_echo messages to avoid infinite loops
                  if (event.message.is_echo) {
                    console.log("Echo message received, skipping auto-reply.");
                    return;
                  }
                  // Auto-reply filler 
                  const replyUrl = `https://graph.instagram.com/v25.0/${process.env.TEST_INSTA_ID}/messages`;
                  // Example auto-reply (replace with actual reply logic)
                  const replyResponse = await axios.post(replyUrl, {
                    message: {
                      text: "Dhoni is the best cricketer ever! 🏏"

                    },
                    recipient: {
                      id: event.sender.id
                    }
                  }, {
                    headers: {
                      'Authorization': `Bearer ${process.env.TEST_ACCESS_TOKEN}`
                    }
                  });


                }
              } catch (error) {
                console.log(error.response ? error.response.data : error.message);
              }
            });
          }

          if (entry.changes) {
            entry.changes.forEach(async (change) => {
              if (change.field === "comments") {
                const comment = change.value;

                console.log("Comment received:");
                console.log("From:", comment.from.username);
                console.log("Comment:", comment.text);
                console.log("Media ID:", comment.media.id);
                console.log("Comment ID:", comment.id);


                if (comment.from.id === entry.id) {
                  console.log("Comment is from the page itself, skipping auto-reply to avoid loops.");
                  return;
                }

                if(containsProfanity(comment.text)){
                  console.log(`Comment contains profanity, hiding comment with ID: ${comment.id}`);
                  await axios.post(
                    `https://graph.instagram.com/v25.0/${comment.id}`,
                    null,
                    {
                      params: {
                        access_token: process.env.TEST_ACCESS_TOKEN,
                        hide: true
                      }
                    }
                  );
                  return;
                }

                const replyUrl = `https://graph.instagram.com/v25.0/${comment.id}/replies`;
                const replyResponse = await axios.post(replyUrl, {
                  message: "Thanks for your comment! 🙌"

                }, {
                  headers: {
                    'Authorization': `Bearer ${process.env.TEST_ACCESS_TOKEN}`
                  }
                });

                console.log("Auto-reply sent for comment ID:", comment.id);
              }
            });
          }

        });
      }
    } catch (e) {
      console.error("Webhook error:", e);
    }

    return res.sendStatus(200);
  }

  if (req.method === "GET") {
    const hub_mode = req.query["hub.mode"];
    const hub_challenge = req.query["hub.challenge"];
    const hub_verify_token = req.query["hub.verify_token"];

    if (hub_mode === "subscribe" && hub_challenge) {
      return res.send(hub_challenge);
    } else {
      return res.send("<p>This is GET Request, Hello Webhook!</p>");
    }
  }
});


app.get("/redirect", async (req, res) => {
  try {
    const code = req.query.code + "#_";

    const url = "https://api.instagram.com/oauth/access_token"
    const params = new URLSearchParams();

    params.append('client_id', process.env.APP_ID);
    params.append('client_secret', process.env.APP_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', process.env.REDIRECT_URI);
    params.append('code', code);

    const response = await axios.post(
      'https://api.instagram.com/oauth/access_token',
      params,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    // const form_data = {
    //   "client_id": process.env.APP_ID,
    //   "client_secret": process.env.APP_SECRET,
    //   "grant_type": "authorization_code",
    //   "redirect_uri": process.env.REDIRECT_URI,
    //   "code": code
    // }
    // // send POST request to exchange code for access token
    // const response = await axios.post(url, form_data);

    const accessToken = response.data.access_token;

    // get Long-Lived Access Token

    const payload = {
      "grant_type": "ig_exchange_token",
      "client_secret": process.env.APP_SECRET,
      "access_token": accessToken
    }

    const responseLong = await axios.get("https://graph.instagram.com/access_token", {
      params: payload
    })

    console.log("Long-Lived Access Token Response:", responseLong.data);

    res.status(200).send({
      success: true,
      access_token: responseLong.data.access_token,
      expires_in: responseLong.data.expires_in
    })

  } catch (error) {
    console.error("Error processing redirect:", error);
    res.status(500).send("<p>Error processing redirect. Check server logs for details.</p>");
  }

});

app.get("/me", async (req, res) => {
  try {
    const accessToken = req.query.access_token || process.env.TEST_ACCESS_TOKEN;
    if (!accessToken) {
      return res.status(400).send({ error: "Access token is required" });
    }
    const url = "https://graph.instagram.com/v25.0/me"
    const params = {
      fields: "id,username",
      access_token: accessToken
    }

    const response = await axios.get(url, { params });
    res.status(200).send(response.data);

  } catch (error) {
    console.error("Error fetching user info:", error);
    res.status(500).send({ error: "Failed to fetch user info" });
  }
})

app.get('/insights/follower_demographics', async (req, res) => {
  try {
    const accessToken = req.query.access_token || process.env.TEST_ACCESS_TOKEN;
    const instagramId = req.query.instagram_id || process.env.TEST_INSTA_ID;
    if (!accessToken) {
      return res.status(400).send({ error: "Access token is required" });
    }
    if (!instagramId) {
      return res.status(400).send({ error: "Instagram ID is required" });
    }

    const url = `https://graph.instagram.com/v25.0/${instagramId}/insights`;
    const params = {
      metric: "follower_demographics",
      access_token: accessToken,
      period: "lifetime",
      breakdowns: "age,gender,city,country",
      metric_type: "total_value"
    }

    const response = await axios.get(url, { params });
    res.status(200).send(response.data);



  } catch (error) {
    console.error("Error fetching follower demographics:", error);
    res.status(500).send({ error: "Failed to fetch follower demographics" });
  }
})

app.get('/insights/engaged_audience_demographics', async (req, res) => {
  try {
    const accessToken = req.query.access_token || process.env.TEST_ACCESS_TOKEN;
    const instagramId = req.query.instagram_id || process.env.TEST_INSTA_ID;
    if (!accessToken) {
      return res.status(400).send({ error: "Access token is required" });
    }
    if (!instagramId) {
      return res.status(400).send({ error: "Instagram ID is required" });
    }
    const timeframe = req.query.timeframe || "this_month";

    const url = `https://graph.instagram.com/v25.0/${instagramId}/insights`;
    const params = {
      metric: "engaged_audience_demographics",
      access_token: accessToken,
      period: "lifetime",
      timeframe: timeframe,
      breakdowns: "age,gender,city,country",
      metric_type: "total_value"
    }

    const response = await axios.get(url, { params });
    res.status(200).send(response.data);



  } catch (error) {
    console.error("Error fetching engaged audience demographics:", error);
    res.status(500).send({ error: "Failed to fetch engaged audience demographics" });
  }
})

app.get('/insights/likes', async (req, res) => {
  try {
    const accessToken = req.query.access_token || process.env.TEST_ACCESS_TOKEN;
    const instagramId = req.query.instagram_id || process.env.TEST_INSTA_ID;
    if (!accessToken) {
      return res.status(400).send({ error: "Access token is required" });
    }
    if (!instagramId) {
      return res.status(400).send({ error: "Instagram ID is required" });
    }

    const url = `https://graph.instagram.com/v25.0/${instagramId}/insights`;


    // U can use since and until to get data for specific time range. Here we are getting data for last 1 day.
    const params = {
      metric: "likes",
      access_token: accessToken,
      period: "day",
      breakdown: "media_product_type",
      metric_type: "total_value",
      until: Math.floor(Date.now() / 1000) // current time in seconds
    }

    const response = await axios.get(url, { params });
    res.status(200).send(response.data);



  } catch (error) {
    console.error("Error fetching likes insights:", error);
    res.status(500).send({ error: "Failed to fetch likes insights" });
  }
})

app.get("/insights/follows_and_unfollows", async (req, res) => {
  try {
    const accessToken = req.query.access_token || process.env.TEST_ACCESS_TOKEN;
    const instagramId = req.query.instagram_id || process.env.TEST_INSTA_ID;
    if (!accessToken) {
      return res.status(400).send({ error: "Access token is required" });
    }
    if (!instagramId) {
      return res.status(400).send({ error: "Instagram ID is required" });
    }

    const url = `https://graph.instagram.com/v25.0/${instagramId}/insights`;

    const params = {
      metric: "follows_and_unfollows",
      access_token: accessToken,
      period: "day",
      metric_type: "total_value",
    }

    const response = await axios.get(url, { params });
    res.status(200).send(response.data);

  } catch (error) {
    console.error("Error fetching follows and unfollows insights:", error);
    res.status(500).send({ error: "Failed to fetch follows and unfollows insights" });
  }
})


/*
The number of unique accounts that have seen your content, at least once, including in ads. Content includes posts, stories, reels, videos and live videos. Reach is different from impressions, which may include multiple views of your content by the same accounts.
TIMESERIES (DayWise)
*/
app.get("/insights/reach", async (req, res) => {
  try {
    const accessToken = req.query.access_token || process.env.TEST_ACCESS_TOKEN;
    const instagramId = req.query.instagram_id || process.env.TEST_INSTA_ID;
    if (!accessToken) {
      return res.status(400).send({ error: "Access token is required" });
    }
    if (!instagramId) {
      return res.status(400).send({ error: "Instagram ID is required" });
    }

    const url = `https://graph.instagram.com/v25.0/${instagramId}/insights`;

    const params = {
      metric: "reach",
      access_token: accessToken,
      period: "day",
      breakdown: "media_product_type",
      metric_type: "time_series",
      since: Math.floor(Date.now() / 1000) - 24 * 3600 // 1 day ago
    }

    const response = await axios.get(url, { params });
    res.status(200).send(response.data);


  }
  catch (error) {
    console.error("Error fetching reach insights:", error);
    res.status(500).send({ error: "Failed to fetch reach insights" });
  }
})

app.get("/posts", async (req, res) => {
  try {
    const accessToken = req.query.access_token || process.env.TEST_ACCESS_TOKEN;
    const instagramId = req.query.instagram_id || process.env.TEST_INSTA_ID;
    if (!accessToken) {
      return res.status(400).send({ error: "Access token is required" });
    }
    if (!instagramId) {
      return res.status(400).send({ error: "Instagram ID is required" });
    }

    const url = "https://graph.instagram.com/me/media"

    const params = {
      fields: "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count,comments{id, text, timestamp},children{media_type,media_url,permalink}",
      limit: 50,
      access_token: accessToken
    }

    const response = await axios.get(url, { params });
    res.status(200).send(response.data);

  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).send({ error: "Failed to fetch posts" });
  }

})

app.get("/stories", async (req, res) => {
  try {
    const accessToken = req.query.access_token || process.env.TEST_ACCESS_TOKEN;
    const instagramId = req.query.instagram_id || process.env.TEST_INSTA_ID;
    if (!accessToken) {
      return res.status(400).send({ error: "Access token is required" });
    }
    if (!instagramId) {
      return res.status(400).send({ error: "Instagram ID is required" });
    }

    const url = "https://graph.instagram.com/me/stories"

    const params = {
      fields: "id,media_type,media_url,permalink,timestamp,comments{id, text, timestamp},like_count,comments_count",
      access_token: accessToken
    }

    const response = await axios.get(url, { params });
    res.status(200).send(response.data);

  }
  catch (error) {
    console.error("Error fetching stories:", error);
    res.status(500).send({ error: "Failed to fetch stories" });
  }
})

app.get("/suggest-caption", async (req, res) => {
  try {
    // Get image in base64 format from query parameter
    const imageUrl = req.query.image_url;
    let base64_image = "";
    if (!imageUrl) {
      // TESTING 
      base64_image = fs.readFileSync('public/image(2).png', { encoding: 'base64' });
      // Change to this 
      // return res.status(400).send({ error: "Image URL is required" });
    }
    const chatCompletion = await groq.chat.completions.create({
      "messages": [
        {
          "role": "user",
          "content": [
            {
              "type": "text",
              "text": "Provide a creative and engaging caption for this Instagram post. The caption should be relevant to the content of the image and should encourage users to engage with the post. Please keep the caption concise and catchy. Include relevant hashtags that are popular and trending in the Instagram community to increase the visibility of the post. The caption should be suitable for a wide audience and should not contain any offensive or inappropriate language. DO NOT include any other things except THE CAPTION and HASHTAGS in your response. DO NOT include any explanations or additional text. ONLY PROVIDE THE CAPTION AND HASHTAGS.I am going to copy paste it directly"
            },
            {
              "type": "image_url",
              "image_url": {
                "url": `data:image/jpeg;base64,${base64_image}`,
              }
            }
          ]
        }
      ],
      "model": "meta-llama/llama-4-scout-17b-16e-instruct",
      "temperature": 1,
      "max_completion_tokens": 1024,
      "top_p": 1,
      "stream": false,
      "stop": null
    });

    console.log(chatCompletion.choices[0].message.content);
    res.status(200).send({ caption: chatCompletion.choices[0].message.content });
  } catch (error) {
    console.error("Error suggesting caption:", error);
    res.status(500).send({ error: "Failed to suggest caption" });
  }
})

app.get("/content-stats", async (req, res) => {
  try {
    const { mediaId } = req.query;
    // if(!mediaId){
    //   return res.status(400).send({error: "Media ID is required"});
    // }
    const url = `https://graph.instagram.com/v25.0/${mediaId || process.env.TEST_MEDIA_ID}/insights`;
    const params = {
      metric: "reach,total_interactions,views,follows,shares",
      access_token: process.env.TEST_ACCESS_TOKEN,
    }

    const response = await axios.get(url, { params });
    res.status(200).send(response.data);


  } catch (error) {
    console.error("Error fetching content stats:", error);
    res.status(500).send({ error: "Failed to fetch content stats" });
  }
})

app.get("/get_reel-stats", async (req, res) => {
  try {
    const { mediaId } = req.query;
    // reels_skip_rate
    const url = `https://graph.instagram.com/v25.0/${mediaId || process.env.TEST_MEDIA_ID}/insights`;
    const params = {
      metric: "reels_skip_rate ,views,reposts",
      access_token: process.env.TEST_ACCESS_TOKEN,
    }
    const response = await axios.get(url, { params });
    res.status(200).send(response.data);
  }
  catch (error) {
    console.error("Error fetching reel stats:", error);
    res.status(500).send({ error: "Failed to fetch reel stats" });
  }
})

app.get("/hide-comments", async (req, res) => {
  try {
    // Get all the comments of a media and hide them if checkProfanity is true
    const { mediaId } = req.query;
    const url = `https://graph.instagram.com/v25.0/${mediaId || process.env.TEST_MEDIA_ID}/comments`;
    const params = {
      access_token: process.env.TEST_ACCESS_TOKEN,
      fields: "id,text"
    }
    const response = await axios.get(url, { params });
    const comments = response.data.data;
    console.log("Comments fetched:", comments);
    for (let comment of comments) {
      if (containsProfanity(comment.text)) {
        console.log(`Hiding comment with ID: ${comment.id} due to profanity.`);
        await axios.post(
          `https://graph.instagram.com/v25.0/${comment.id}`,
          null,
          {
            params: {
              access_token: process.env.TEST_ACCESS_TOKEN,
              hide: true
            }
          }
        );
      }
    }
    res.status(200).send({ success: true, message: "Comments have been checked for profanity and hidden if necessary." });

  } catch (error) {
    console.error("Error hiding comments:", error);
    res.status(500).send({ error: "Failed to hide comments" });
  }
})

app.get('/post-performance/:mediaId', async (req, res) => {
  const { mediaId } = req.params || process.env.TEST_MEDIA_ID;
  const accessToken = process.env.TEST_ACCESS_TOKEN;
  const instagramId = process.env.TEST_INSTA_ID;
  try {
      const urlFollowers = `https://graph.instagram.com/v25.0/${instagramId}/insights`;
    const params = {
      metric: "follower_demographics",
      access_token: accessToken,
      period: "lifetime",
      metric_type: "total_value"
    }

    const responseFollowers = await axios.get(urlFollowers, { params });
    console.log("Follower Demographics:", responseFollowers.data);

    const followers = responseFollowers.data?.data[0]?.values[0]?.value?.total_followers || 1; // Avoid division by zero

    const url = `https://graph.instagram.com/v25.0/${mediaId}?fields=like_count,comments_count,timestamp&access_token=${accessToken}`;
    
    const response = await axios.get(url);
    const data = response.data;

    console.log("Post Data:", data);

    const engagementRate = weightedEngagement(data, followers);

    console.log("Engagement Rate:", engagementRate.toFixed(2) + '%');

    const perfVelocity = performanceVelocity(data);

    console.log("Performance Velocity:", perfVelocity.toFixed(2) + ' interactions/hour');

    const viralScore = viralityScore(data , followers);

    console.log("Virality Score:", viralScore.toFixed(2) + '%');

    


    res.json({
      raw: data,
      insights: {
        engagementRate: engagementRate.toFixed(2) + '%',
        performanceVelocity: perfVelocity.toFixed(2) + ' interactions/hour',
        viralityScore: viralScore.toFixed(2) + '%'
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message , response : err.response ? err.response.data : null });
  }
});


app.get('/best-time', async (req, res) => {
  const igUserId = process.env.TEST_INSTA_ID;
  const accessToken = process.env.TEST_ACCESS_TOKEN;

  try {
    const url = `https://graph.instagram.com/v25.0/${igUserId}/insights?metric=online_followers&period=lifetime&access_token=${accessToken}`;
    
    const response = await axios.get(url);

    const data = response.data ;

    console.log("Raw Data:", JSON.stringify(data, null, 4));

    // Find peak hour
    let bestHour = Object.keys(data).reduce((a, b) =>
      data[a] > data[b] ? a : b
    );

    res.json({
      hourlyData: data,
      bestHour: `${bestHour}:00`
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/follower-growth', async (req, res) => {
  const igUserId = process.env.TEST_INSTA_ID;
  const accessToken = process.env.TEST_ACCESS_TOKEN;

  try {
    const url = `https://graph.instagram.com/v25.0/${igUserId}/insights?metric=follower_count&period=day&access_token=${accessToken}`;
    
    const response = await axios.get(url);

    const values = response.data;

    console.log("Raw Data:", JSON.stringify(values, null, 4));

    const growth = values.map((v, i) => {
      if (i === 0) return { date: v.end_time, growth: 0 };
      return {
        date: v.end_time,
        growth: v.value - values[i - 1].value
      };
    });

    res.json(growth);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/reel-retention/:mediaId', async (req, res) => {
  const { mediaId } = req.params;
  const accessToken = process.env.TEST_ACCESS_TOKEN;

  try {
    const url = `https://graph.instagram.com/v25.0/${mediaId}/insights?metric=plays,reach,total_interactions,video_avg_time_watched&access_token=${accessToken}`;
    
    const response = await axios.get(url);

    const metrics = {};
    response.data.data.forEach(m => {
      metrics[m.name] = m.values[0].value;
    });

    const retentionScore = metrics.video_avg_time_watched
      ? (metrics.video_avg_time_watched / 30) * 100 // assume 30s reel
      : 0;

    res.json({
      metrics,
      retentionScore: retentionScore.toFixed(2) + '%'
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
