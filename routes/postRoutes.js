import express from "express";


const router = express.Router();
import { Post } from "../models/Post.js";


// CREATE OR UPDATE POST SETTINGS
router.post("/settings", async (req, res) => {
    try {
        const {
            userId,
            postId,
            enableAutoHide,
            enableAutoreply,
            message
        } = req.body;

        const post = await Post.findOneAndUpdate(
            { postId },
            {
                userId,
                enableAutoHide,
                enableAutoreply,
                message:
                    enableAutoreply === "static"
                        ? message
                        : ""
            },
            {
                upsert: true,
                new: true
            }
        );

        res.json(post);

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});


// GET ALL POSTS OF USER
router.get("/user/:userId", async (req, res) => {
    try {
        const posts = await Post.find({
            userId: req.params.userId
        });

        res.json(posts);

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});


// GET SINGLE POST
router.get("/:postId", async (req, res) => {
    try {
        const post = await Post.findOne({
            postId: req.params.postId
        });

        res.json(post);

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});
export default router;