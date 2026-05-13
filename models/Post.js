import mongoose from "mongoose";
const PostSchema = new mongoose.Schema(
    {
        postId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        userId: {
            type: String,
            required: true,
            index: true
        },

        enableAutoHide: {
            type: Boolean,
            default: false
        },

        enableAutoreply: {
            type: String,
            enum: ["no", "ai", "static"],
            default: "no"
        },

        message: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

export const Post = mongoose.model("Post", PostSchema);
