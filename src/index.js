import express from 'express'
import dotenv from 'dotenv'
import cors from 'cors'
import path from 'path'
import axios from 'axios'
import fs from 'fs'
import Groq from 'groq-sdk'
import { containsProfanity } from 'better-profane-words'
import { performanceVelocity, viralityScore, weightedEngagement } from '../utils/helpers.js'
import userRoutes from "../routes/userRoutes.js";
import postRoutes from "../routes/postRoutes.js";
import qs from 'qs';
import { connectDB } from '../config/db.js'
import { instagramAuthMiddleware } from '../middleware/user.middleware.js'
import { insertAllposts } from '../helper/insertPosts.js'
import { User } from '../models/User.js'
dotenv.config()

const app = express()
const port = 3000

app.use(express.static("public"));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cors());

app.use("/api/users", userRoutes);
app.use("/api/posts", postRoutes);

const groq = new Groq();



app.get('/', (req, res) => {
  res.send('Hello Wodbffbrld!')
})

app.get("/privacy_policy", (req, res) => {
  res.sendFile("privacy_policy.html", { root: path.join(process.cwd(), "public") });
});


app.all("/webhook", instagramAuthMiddleware, async (req, res) => {
  if (req.method === "POST") {
    try {
      console.log(JSON.stringify(req.body, null, 6));

      if (req.body.object === "instagram") {
        req.body.entry.forEach((entry) => {

          if (entry.messaging) {
            entry.messaging.forEach(async (event) => {
              try {
                if (event.message.read) {
                  console.log("Message read event received for message ID:", event.message.read.mid);
                  return;
                }
                if (event.message && event.message.text) {
                  console.log("DM received:");
                  console.log("Sender ID:", event.sender.id);
                  console.log("Message:", event.message.text);
                  // Do not reply for is_echo messages to avoid infinite loops

                  if (event.message.is_echo) {
                    try {
                         const username = event.message.text.trim();
                    const senderId = event.sender.id;

                      const res = await User.findOneAndUpdate(
                        { username: username },
                        {
                          webhookId: senderId
                        })

                      if (!res) {
                        console.log("User not found in DB for auto DM setup, skipping auto DM setup for this user.");
                        return;
                      }
                      console.log(`Updated user ${username} with webhook ID ${senderId}`);
                      return;
                    } catch (error) {
                      console.log("USer not found in DB for auto DM setup, skipping auto DM setup for this user.");
                      return;
                    }
                    return;
                  }


                  // if (event.message.is_echo) {
                  //   console.log("Echo message received, skipping auto-reply.");
                  //   return;
                  // }

                  // Auto-reply filler 
                  // Get User preferences from DB and decide whether to auto-reply or not.

                  if (event.recipient.id === process.env.RECIPIENT_ID) {
                    // message contains the username and the sender id should be stored in the DB 
                    const username = event.message.text.trim();
                    const senderId = event.sender.id;

                    // Update the user in DB with the senderId and username
                    try {
                      const res = await User.findOneAndUpdate(
                        { username: username },
                        {
                          webhookId: senderId
                        })

                      if (!res) {
                        console.log("User not found in DB for auto DM setup, skipping auto DM setup for this user.");
                        return;
                      }
                      console.log(`Updated user ${username} with webhook ID ${senderId}`);
                      return;
                    } catch (error) {
                      console.log("USer not found in DB for auto DM setup, skipping auto DM setup for this user.");
                      return;
                    }

                  }


                  const userPref = await axios.get(`${process.env.BASE_URL}/api/users/${event.recipient.id}`);

                  if (userPref.data.enableAutoDM === "no") {
                    console.log("Auto-DM is disabled for this user, skipping auto-reply.");
                    return;
                  }
                  let message = "";
                  if (userPref.data.enableAutoDM === "static") {
                    console.log("Static Auto-DM is enabled. Replying with static message.");
                    message = userPref.data.message || "Thanks for reaching out! We'll get back to you soon.";
                  }
                  if (userPref.data.enableAutoDM === "ai") {
                    console.log("AI Auto-DM is enabled. Generating reply using AI.");
                    const chatCompletion = await groq.chat.completions.create({
                      messages: [
                        {
                          role: "system",
                          content: `You are a helpful and concise assistant for replying to Instagram DMs on behalf of a user. Generate a friendly and engaging reply based on the incoming message. Keep the reply short (1-2 sentences) and relevant to the user's message. Do not include any greetings or sign-offs, just a direct response to the message. If the message is a common question, provide a helpful answer. If the message is vague, provide a generic but polite response. Always maintain a positive and professional tone. NEVER ask for personal information or include any sensitive content in your reply. ONLY generate the reply message without any additional text or explanations. 
                              User SPECIFIED INSTRUCTION : ${userPref.data.message}
                            `
                        },
                        {
                          role: "user",
                          content: `Generate a reply for this Instagram DM:\n\n"${event.message.text}"`
                        }
                      ],
                      model: "meta-llama/llama-4-scout-17b-16e-instruct",
                      temperature: 0.7,
                      max_completion_tokens: 256,
                      stream: false
                    });
                    message = chatCompletion.choices[0].message.content.trim();
                  }

                  const replyUrl = `https://graph.instagram.com/v25.0/${userPref.data.userId}/messages`;
                  // Example auto-reply (replace with actual reply logic)
                  const replyResponse = await axios.post(replyUrl, {
                    message: {
                      text: message
                    },
                    recipient: {
                      id: event.sender.id
                    }
                  }, {
                    headers: {
                      'Authorization': `Bearer ${userPref.data.access_token}`
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
              try {
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
                  //  Check if user has enabled auto-hide or auto-reply for comments in DB and then take action accordingly.
                  const postPref = await axios.get(`${process.env.BASE_URL}/api/posts/${comment.media.id}`);

                  if (postPref.data.enableAutoHide === false && postPref.data.enableAutoreply === "no") {
                    console.log("Auto-hide and Auto-reply are disabled for this post, skipping actions.");
                    return;
                  }

                  if (postPref.data.enableAutoHide === true) {
                    if (containsProfanity(comment.text)) {
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
                  }

                  const replyUrl = `https://graph.instagram.com/v25.0/${comment.id}/replies`;
                  if (postPref.data.enableAutoreply === "static") {
                    const replyResponse = await axios.post(replyUrl, {
                      message: postPref.data.message || "Thanks for your comment! We appreciate your engagement."
                    }, {
                      headers: {
                        'Authorization': `Bearer ${process.env.TEST_ACCESS_TOKEN}`
                      }
                    });
                  } else if (postPref.data.enableAutoreply === "ai") {
                    const chatCompletion = await groq.chat.completions.create({
                      messages: [
                        {
                          role: "system",
                          content: `You are a helpful and concise assistant for replying to Instagram comments on behalf of a user. Generate a friendly and engaging reply based on the incoming comment. Keep the reply short (1-2 sentences) and relevant to the user's comment. If the comment is a common question, provide a helpful answer. If the comment is vague, provide a generic but polite response. Always maintain a positive and professional tone. NEVER ask for personal information or include any sensitive content in your reply. ONLY generate the reply message without any additional text or explanations.
                        User SPECIFIED INSTRUCTION : ${postPref.data.message}
                      `
                        },
                        {
                          role: "user",
                          content: `Generate a reply for this Instagram comment:\n\n"${comment.text}"`
                        }
                      ],
                      model: "meta-llama/llama-4-scout-17b-16e-instruct",
                      temperature: 0.7,
                      max_completion_tokens: 256,
                      stream: false
                    });
                    const aiReply = chatCompletion.choices[0].message.content.trim();
                    const replyResponse = await axios.post(replyUrl, {
                      message: aiReply
                    }, {
                      headers: {
                        'Authorization': `Bearer ${process.env.TEST_ACCESS_TOKEN}`
                      }
                    });
                  }

                  console.log("Auto-reply sent for comment ID:", comment.id);
                }
              } catch (error) {
                console.log(error.response ? error.response.data : error.message);
              }
            });

          }

        });
      }
    } catch (e) {
      console.error("Webhook error:", e.response ? e.response.data : e.message);
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



    const data = qs.stringify({
      client_id: process.env.APP_ID,
      client_secret: process.env.APP_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: process.env.REDIRECT_URI,
      code: code
    });


    const response = await axios.post(
      url,
      data
    );
    console.log("success")
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

    console.log("Short-Lived Access Token Response:", response.data);

    const responseLong = await axios.get("https://graph.instagram.com/access_token", {
      params: payload
    })


    // console.log("Lon g-Lived Access Token Response:", responseLong.data);
    // Run /me endpoint to verify token and get user info
    const meResponse = await axios.get("https://graph.instagram.com/me", {
      params: {
        fields: "id,username",
        access_token: responseLong.data.access_token
      }
    });
    // Create user in DB 
    await axios.post(`${process.env.BASE_URL}/api/users/create`, {
      userId: meResponse.data.id,
      username: meResponse.data.username,
      access_token: responseLong.data.access_token
    });

    await insertAllposts(meResponse.data.id, responseLong.data.access_token);

    return res.redirect(`myapp://auth?token=${responseLong.data.access_token}&instagram_id=${meResponse.data.id}&username=${meResponse.data.username}`);

  } catch (error) {
    console.log(error.request)
    return res.status(500).send({ error: "Failed to exchange code for access token", details: error.response ? error.response.data : error.message });
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
    const instagramId = req.query.instagramId || process.env.TEST_INSTA_ID;
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
    const instagramId = req.query.instagramId || process.env.TEST_INSTA_ID;
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
    const instagramId = req.query.instagramId || process.env.TEST_INSTA_ID;
    if (!accessToken) {
      return res.status(400).send({ error: "Access token is required" });
    }
    if (!instagramId) {
      return res.status(400).send({ error: "Instagram ID is required" });
    }

    const url = `https://graph.instagram.com/v25.0/${instagramId}/insights`;

    const days = parseInt(req.query.days) || 1;

    // U can use since and until to get data for specific time range. Here we are getting data for last 1 day.
    const params = {
      metric: "likes",
      access_token: accessToken,
      period: "day",
      breakdown: "media_product_type",
      metric_type: "total_value",
    }

    const response = await axios.get(url, { params });
    res.status(200).send(response.data);



  } catch (error) {
    console.error("Error fetching likes insights:", error);
    res.status(500).send({ error: "Failed to fetch likes insights", message: error.response ? error.response.data : error.message });
  }
})

app.get("/insights/follows_and_unfollows", async (req, res) => {
  try {
    const accessToken = req.query.access_token || process.env.TEST_ACCESS_TOKEN;
    const instagramId = req.query.instagramId || process.env.TEST_INSTA_ID;
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
// TODO : Add it to the App

/*
The number of unique accounts that have seen your content, at least once, including in ads. Content includes posts, stories, reels, videos and live videos. Reach is different from impressions, which may include multiple views of your content by the same accounts.
TIMESERIES (DayWise)
*/
app.get("/insights/reach", async (req, res) => {
  try {
    const accessToken = req.query.access_token || process.env.TEST_ACCESS_TOKEN;
    const instagramId = req.query.instagramId || process.env.TEST_INSTA_ID;
    if (!accessToken) {
      return res.status(400).send({ error: "Access token is required" });
    }
    if (!instagramId) {
      return res.status(400).send({ error: "Instagram ID is required" });
    }

    const url = `https://graph.instagram.com/v25.0/${instagramId}/insights`;
    const days = parseInt(req.query.days) || 1; // default to last 1 day
    const params = {
      metric: "reach",
      access_token: accessToken,
      period: "day",
      breakdown: "media_product_type",
      metric_type: "time_series",
      since: Math.floor(Date.now() / 1000) - days * 24 * 3600 // 30 day ago
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
    const instagramId = req.query.instagramId || process.env.TEST_INSTA_ID;
    if (!accessToken) {
      return res.status(400).send({ error: "Access token is required" });
    }
    if (!instagramId) {
      return res.status(400).send({ error: "Instagram ID is required" });
    }

    const url = "https://graph.instagram.com/me/media"

    const params = {
      fields: "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count,comments{id, text, timestamp, like_count},children{media_type,media_url,permalink}",
      limit: 50,
      access_token: accessToken
    }
    await insertAllposts(instagramId, accessToken);
    const response = await axios.get(url, { params });
    res.status(200).send(response.data);

  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).send({ error: "Failed to fetch posts" });
  }

})
// TODO : Paginate it and add to the App

app.get("/stories", async (req, res) => {
  try {
    const accessToken = req.query.access_token || process.env.TEST_ACCESS_TOKEN;
    const instagramId = req.query.instagramId || process.env.TEST_INSTA_ID;
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
// TODO : Add it to the App

app.post("/suggest-caption", async (req, res) => {
  try {
    // Get image in base64 format from query parameter
    let base64_image = req.body.image_base64 || "";
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
// TODO : Add to App
app.get('/best-time', async (req, res) => {
  const igUserId = req.query.instagramId || process.env.TEST_INSTA_ID;
  const accessToken = process.env.TEST_ACCESS_TOKEN;

  try {
    const url = `https://graph.instagram.com/v25.0/${igUserId}/insights?metric=online_followers&period=lifetime&access_token=${accessToken}`;

    const response = await axios.get(url);

    const data = response.data;

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
  const igUserId = req.query.instagramId || process.env.TEST_INSTA_ID;
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
// TODO : Add it to the App
//-------------------------------------------------------------
// Post specific insights like reach, impressions, interactions, saves, shares, etc. for a given media ID


app.get("/content-stats", async (req, res) => {
  try {
    const { mediaId } = req.query || process.env.TEST_MEDIA_ID;
    const accessToken = req.query.access_token || process.env.TEST_ACCESS_TOKEN;
    // if(!mediaId){
    //   return res.status(400).send({error: "Media ID is required"});
    // }

    const url = `https://graph.instagram.com/v25.0/${mediaId}/insights`;
    const params = {
      metric: "reach,total_interactions,views,shares",
      access_token: accessToken,
    }

    const response = await axios.get(url, { params });
    res.status(200).send(response.data);


  } catch (error) {
    console.error("Error fetching content stats:", error);
    res.status(500).send({
      error: "Failed to fetch content stats",
      details: error.response ? error.response.data : error.message
    },);
  }
})



app.get("/reel-stats", async (req, res) => {
  try {
    const { mediaId } = req.query || process.env.TEST_MEDIA_ID;
    const accessToken = req.query.access_token || process.env.TEST_ACCESS_TOKEN;
    // reels_skip_rate
    const url = `https://graph.instagram.com/v25.0/${mediaId}/insights`;
    const params = {
      metric: "reels_skip_rate,views",
      access_token: accessToken,
    }
    const response = await axios.get(url, { params });
    res.status(200).send(response.data);
  }
  catch (error) {
    console.error("Error fetching reel stats:", error);
    res.status(500).send({ error: "Failed to fetch reel stats" });
  }
})


// TODO : Add it to the App

app.get('/post-performance', async (req, res) => {
  const { mediaId } = req.query || process.env.TEST_MEDIA_ID;
  const accessToken = req.query.access_token || process.env.TEST_ACCESS_TOKEN;
  const instagramId = req.query.instagramId || process.env.TEST_INSTA_ID;
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

    // const followers = responseFollowers.data?.data?[0]?.values[0]?.value?.total_followers || 1; // Avoid division by zero
    const followers = 168; // Avoid division by zero
    const url = `https://graph.instagram.com/v25.0/${mediaId}?fields=like_count,comments_count,timestamp&access_token=${accessToken}`;

    const response = await axios.get(url);
    const data = response.data;

    console.log("Post Data:", data);

    const engagementRate = weightedEngagement(data, followers);

    console.log("Engagement Rate:", engagementRate.toFixed(2) + '%');

    const perfVelocity = performanceVelocity(data);

    console.log("Performance Velocity:", perfVelocity.toFixed(2) + ' interactions/hour');

    const viralScore = viralityScore(data, followers);

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
    res.status(500).json({ error: err.message, response: err.response ? err.response.data : null });
  }
});
// TODO : Add it to the App

app.get('/analytics/comment-sentiment', async (req, res) => {
  try {
    // Get top 50 comments of a media and analyze sentiment using Groq. Filter out auto-replies from the account itself before analysis.
    const { mediaId } = req.query || process.env.TEST_MEDIA_ID;
    const accessToken = req.query.access_token || process.env.TEST_ACCESS_TOKEN;
    const limit = parseInt(req.query.limit) || 50;

    if (!mediaId) {
      return res.status(400).send({ error: "Media ID is required" });
    }

    // Step 1: Fetch YOUR own username to filter out auto-replies
    const meResponse = await axios.get(`https://graph.instagram.com/v25.0/me`, {
      params: {
        fields: "id,username",
        access_token: accessToken
      }
    });
    const myUsername = meResponse.data.username;
    const myId = meResponse.data.id;

    // Step 2: Fetch comments
    const commentsResponse = await axios.get(
      `https://graph.instagram.com/v25.0/${mediaId}/comments`,
      {
        params: {
          access_token: accessToken,
          fields: "id,text,timestamp,username,from",
          limit: 50
        }
      }
    );

    console.log("Fetched Comments:", commentsResponse.data);

    const allComments = commentsResponse.data.data;

    console.log(allComments)

    if (!allComments || allComments.length === 0) {

      return res.status(200).send({
        mediaId,
        total_comments: 0,
        overall: {
          sentiment: "neutral",
          score: 0.0,
          summary:
            "There are no comments available for this post, so no audience sentiment could be determined.",
          breakdown: {
            positive: 0,
            negative: 0,
            neutral: 0,
          },
        }
      });
    }

    // Step 3: Filter out your own auto-replies
    const comments = allComments.filter(comment => {
      const isOwnUsername = comment.username === myUsername;
      const isOwnId = comment.from?.id === myId;
      return !isOwnUsername && !isOwnId;
    });

    console.log(`Filtered ${allComments.length - comments.length} auto-reply comment(s) from analysis.`);

    if (comments.length === 0) {

      return res.status(200).send({
        mediaId,
        total_comments: 0,
        overall: {
          sentiment: "neutral",
          score: 0.0,
          summary:
            "There are no comments available for this post, so no audience sentiment could be determined.",
          breakdown: {
            positive: 0,
            negative: 0,
            neutral: 0,
          },
        }
      });
    }

    // Step 4: Prepare comment texts for Groq
    const commentTexts = comments.map((c, i) => `${i + 1}. "${c.text}"`).join('\n');

    // Step 5: Send to Groq for sentiment analysis
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a sentiment analysis engine. Analyze the sentiment of each Instagram comment and return ONLY a valid JSON object. No explanation. No markdown. No extra text.

The JSON format must be exactly:
{
  "overall_sentiment": "positive" | "negative" | "neutral" | "mixed",
  "overall_score": <number between -1.0 (very negative) to 1.0 (very positive)>,
  "summary": "<3-4 sentence summary of the audience mood and content of the comments>",
  "breakdown": {
    "positive": <count>,
    "negative": <count>,
    "neutral": <count>
  },
  
}`
        },
        {
          role: "user",
          content: `Analyze the sentiment of these Instagram comments:\n\n${commentTexts}`
        }
      ],
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0.2,
      max_completion_tokens: 2048,
      stream: false
    });

    // Step 6: Parse Groq response
    const rawContent = chatCompletion.choices[0].message.content;
    let sentimentResult;

    try {
      const cleaned = rawContent.replace(/```json|```/g, "").trim();
      sentimentResult = JSON.parse(cleaned);
    } catch (parseError) {
      return res.status(500).send({
        error: "Failed to parse sentiment response from AI",
        raw: rawContent
      });
    }

    // Step 7: Merge comment metadata with sentiment results


    res.status(200).send({
      mediaId,
      total_comments: (allComments.length - comments.length),
      overall: {
        sentiment: sentimentResult.overall_sentiment,
        score: sentimentResult.overall_score,
        summary: sentimentResult.summary,
        breakdown: sentimentResult.breakdown
      },

    });

  } catch (error) {
    console.error("Error in comment sentiment analysis:", error);
    res.status(500).send({
      error: "Failed to analyze comment sentiment",
      details: error.response ? error.response.data : error.message
    });
  }
});

app.get("/hide-comments", async (req, res) => {
  try {
    // Get all the comments of a media and hide them if checkProfanity is true
    const { mediaId } = req.query || process.env.TEST_MEDIA_ID;
    const url = `https://graph.instagram.com/v25.0/${mediaId}/comments`;
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


connectDB().then(() => {
  console.log("Connected to MongoDB");
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`)
  })

}).catch(err => {
  console.error("Failed to connect to MongoDB", err);
});
