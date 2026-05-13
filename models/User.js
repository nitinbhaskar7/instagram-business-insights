import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        username: {
            type: String,
            required: true
        },

        enableAutoDM: {
            type: String,
            enum: ["no", "ai", "static"],
            default: "no"
        },

        message: {
            type: String,
            default: ""
        },

        access_token : {
            type: String,
            required: true
        },

        webhookId : {
            type: String,
        }
    },
    {
        timestamps: true
    }
);

export const User = mongoose.model("User", UserSchema); 