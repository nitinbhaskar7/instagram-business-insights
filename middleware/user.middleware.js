import axios from "axios";

export const instagramAuthMiddleware = async (req, res, next) => {
  try {
    const accessToken =
      req.query.access_token || process.env.TEST_ACCESS_TOKEN;

    if (!accessToken) {
      return res.status(400).json({
        error: "Access token is required",
      });
    }

    const response = await axios.get(
      "https://graph.instagram.com/v25.0/me",
      {
        params: {
          fields: "id,username",
          access_token: accessToken,
        },
      }
    );

    // Attach user data to request object
    req.instagramUser = response.data;

    next();
  } catch (error) {
    console.error("Instagram auth middleware error:", error?.response?.data || error.message);

    return res.status(401).json({
      error: "Invalid or expired access token",
    });
  }
};