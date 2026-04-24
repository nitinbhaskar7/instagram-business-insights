export function weightedEngagement(post, followers) {
    /*
Not all interactions are equal:

Comments > Likes (more effort)
New posts should get a time boost
    */
    const likeWeight = 1;
    const commentWeight = 3;

    const score = (post.like_count * likeWeight) +
        (post.comments_count * commentWeight);

    return (score / followers) * 100;
}

export function performanceVelocity(post) {
    // A post with 500 likes in 1 hour > 500 likes in 2 days
    const postTime = new Date(post.timestamp);
    const now = new Date();

    const hours = (now - postTime) / (1000 * 60 * 60);
    return (post.like_count + post.comments_count) / (hours || 1);
}

export function viralityScore(post, followers) {
  const engagement = weightedEngagement(post, followers);
  const velocity = performanceVelocity(post);

  return (engagement * 0.7) + (velocity * 0.3);
}

export function audienceQuality(posts, followers) {
  const totalEngagement = posts.reduce((acc, p) =>
    acc + p.like_count + p.comments_count, 0);

  const avgEngagement = totalEngagement / posts.length;

  return (avgEngagement / followers) * 100;
}