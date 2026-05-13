import axios from "axios";
import { Post } from "../models/Post.js";

export async function insertAllposts(instagramId, accessToken) {
    try {


        if (!accessToken) {
            throw new Error("Access token is required");
        }

        if (!instagramId) {
            throw new Error("Instagram ID is required");
        }

        let allPostIds = [];
        let nextUrl = "https://graph.instagram.com/me/media";

        while (nextUrl) {
            const response = await axios.get(nextUrl, {
                params: {
                    fields: "id",
                    limit: 50,
                    access_token: accessToken,
                },
            });

            const posts = response.data?.data || [];

            // Store only IDs
            const ids = posts.map((post) => post.id);

            allPostIds.push(...ids);

            // Pagination URL
            nextUrl = response.data?.paging?.next || null;
        }

        // Optional: remove duplicates
        allPostIds = [...new Set(allPostIds)];

        //   Insert all posts if already there then do not insert and continue with the rest 

        await Promise.all(
            allPostIds.map(async (postId) => {
                try {
                    await Post.findOneAndUpdate(
                        { postId },
                        { postId, userId: instagramId },
                        { upsert: true, returnDocument: "after" }
                    );
                } catch (err) {
                    console.error(`Error inserting post ${postId}:`, err);
                }
            })
        );

       return true ;

    } catch (error) {
        console.error(
            "Error fetching posts:",
            error.response?.data || error.message
        );

        return res.status(500).send({
            error: "Failed to fetch posts",
        });
    }
}