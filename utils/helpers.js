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

// Convert IG time-series metric object into normalized series: [{ts, value}, ...]
export function formatTimeSeries(metricObj) {
  // metricObj commonly has a `values` array with { end_time, value } or {timestamp, value}
  const values = metricObj?.values || metricObj?.data || [];

  return (values || []).map((v) => {
    const ts = v.end_time || v.timestamp || v.time || v.date || v.ts;
    // ensure ISO string
    const iso = ts ? new Date(ts).toISOString() : null;
    const value = typeof v.value === 'object' ? v.value.total || 0 : v.value || 0;
    return { ts: iso, value };
  }).filter(p => p.ts !== null);
}

// Compute simple statistics for a series
export function computeSeriesStats(series) {
  if (!series || series.length === 0) return {
    avg: 0, max: 0, min: 0, sum: 0, trend: 'flat', peakDate: null, points: 0
  };

  const values = series.map(s => Number(s.value) || 0);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const peakIndex = values.indexOf(max);
  const peakDate = series[peakIndex]?.ts || null;

  // Simple trend: compare first and last value
  const first = values[0];
  const last = values[values.length - 1];
  const changePct = first === 0 ? (last === 0 ? 0 : 1) : (last - first) / Math.abs(first);
  let trend = 'flat';
  if (changePct > 0.05) trend = 'increasing';
  else if (changePct < -0.05) trend = 'decreasing';

  return {
    avg,
    max,
    min,
    sum,
    trend,
    peakDate,
    points: values.length
  };
}