/**
 * Video courses — separate from exam levels and book library.
 * Schema: content.courses.items[].videos[]
 * Videos are YouTube or Google Drive links (no file upload).
 */
(function (global) {
  "use strict";

  function nextId(items) {
    if (!items || !items.length) return 1;
    return Math.max(...items.map((item) => Number(item.id) || 0)) + 1;
  }

  function extractYouTubeId(input) {
    const s = String(input || "").trim();
    if (!s) return null;

    // Prefer explicit v= / embed / shorts / youtu.be — works with &list= and music radio URLs
    let match = s.match(/[?&]v=([a-zA-Z0-9_-]{6,})/i);
    if (match) return match[1];

    match = s.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/i);
    if (match) return match[1];

    match = s.match(/youtube\.com\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{6,})/i);
    if (match) return match[1];

    match = s.match(/^[a-zA-Z0-9_-]{11}$/);
    if (match) return match[1];

    return null;
  }

  function isYouTubeUrl(input) {
    const s = String(input || "");
    return /youtube\.com|youtu\.be/i.test(s) || !!extractYouTubeId(s);
  }

  function detectProvider(url) {
    const trimmed = String(url || "").trim();
    if (!trimmed) return "other";
    const C = global.AscoltoContent;
    if (isYouTubeUrl(trimmed)) return "youtube";
    if (C && typeof C.isGoogleDriveUrl === "function" && C.isGoogleDriveUrl(trimmed)) {
      return "drive";
    }
    if (C && typeof C.extractGoogleDriveFileId === "function" && C.extractGoogleDriveFileId(trimmed)) {
      return "drive";
    }
    if (/drive\.google\.com|docs\.google\.com/i.test(trimmed)) return "drive";
    return "other";
  }

  function normalizeVideoUrl(url) {
    return String(url || "").trim();
  }

  function normalizeVideo(video, index) {
    const url = normalizeVideoUrl(video.url || video.link || video.src || "");
    return {
      id: video.id != null ? Number(video.id) : index + 1,
      title: String(video.title || video.name || `Video ${index + 1}`).trim() || `Video ${index + 1}`,
      url,
      provider: video.provider || detectProvider(url),
    };
  }

  function normalizeCourse(course, index) {
    return {
      id: course.id != null ? Number(course.id) : index + 1,
      name: String(course.name || course.title || `Corso ${index + 1}`).trim() || `Corso ${index + 1}`,
      description: String(course.description || "").trim(),
      videos: Array.isArray(course.videos)
        ? course.videos.map((video, vi) => normalizeVideo(video, vi))
        : [],
    };
  }

  function normalizeCourses(data) {
    const coursesIn = data.courses || {};
    const items = Array.isArray(coursesIn.items)
      ? coursesIn.items.map((course, index) => normalizeCourse(course, index))
      : [];
    items.sort((a, b) => a.id - b.id);
    data.courses = {
      title: String(coursesIn.title || "Corsi video").trim() || "Corsi video",
      description:
        String(
          coursesIn.description || "Scegli un corso e guarda i video della playlist."
        ).trim() || "Scegli un corso e guarda i video della playlist.",
      items,
    };
    return data;
  }

  function ensureCourses(data) {
    if (!data.courses) normalizeCourses(data);
    if (!Array.isArray(data.courses.items)) data.courses.items = [];
    return data.courses;
  }

  function getCourse(data, courseId) {
    return ensureCourses(data).items.find((c) => Number(c.id) === Number(courseId)) || null;
  }

  function createCourse(data, { name, description } = {}) {
    const courses = ensureCourses(data);
    const id = nextId(courses.items);
    const course = normalizeCourse(
      { id, name: name || `Corso ${id}`, description: description || "", videos: [] },
      courses.items.length
    );
    courses.items.push(course);
    courses.items.sort((a, b) => a.id - b.id);
    return course;
  }

  function updateCourse(data, courseId, patch) {
    const course = getCourse(data, courseId);
    if (!course) return null;
    if (patch.name != null) course.name = String(patch.name).trim() || course.name;
    if (patch.description != null) course.description = String(patch.description).trim();
    return course;
  }

  function deleteCourse(data, courseId) {
    const courses = ensureCourses(data);
    const cid = Number(courseId);
    const before = courses.items.length;
    courses.items = courses.items.filter((c) => Number(c.id) !== cid);
    return courses.items.length < before;
  }

  function createVideo(data, courseId, { title, url } = {}) {
    const course = getCourse(data, courseId);
    if (!course) return null;
    const id = nextId(course.videos);
    const video = normalizeVideo({ id, title, url }, course.videos.length);
    course.videos.push(video);
    return video;
  }

  function updateVideo(data, courseId, videoId, patch) {
    const course = getCourse(data, courseId);
    if (!course) return null;
    const video = course.videos.find((v) => Number(v.id) === Number(videoId));
    if (!video) return null;
    if (patch.title != null) video.title = String(patch.title).trim() || video.title;
    if (patch.url != null) {
      video.url = normalizeVideoUrl(patch.url);
      video.provider = detectProvider(video.url);
    }
    return video;
  }

  function deleteVideo(data, courseId, videoId) {
    const course = getCourse(data, courseId);
    if (!course) return false;
    const vid = Number(videoId);
    const before = course.videos.length;
    course.videos = course.videos.filter((v) => Number(v.id) !== vid);
    return course.videos.length < before;
  }

  /**
   * Build an embeddable iframe src for YouTube or Drive; empty if unsupported.
   */
  function getEmbedUrl(url) {
    const trimmed = String(url || "").trim();
    if (!trimmed) return "";

    const ytId = extractYouTubeId(trimmed);
    if (ytId) {
      return `https://www.youtube.com/embed/${encodeURIComponent(ytId)}?rel=0`;
    }

    const C = global.AscoltoContent;
    if (C && typeof C.extractGoogleDriveFileId === "function") {
      const fileId = C.extractGoogleDriveFileId(trimmed);
      if (fileId && typeof C.toGoogleDrivePreviewUrl === "function") {
        return C.toGoogleDrivePreviewUrl(fileId);
      }
      if (fileId) {
        return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
      }
    }

    return "";
  }

  function getWatchUrl(url) {
    const trimmed = String(url || "").trim();
    if (!trimmed) return "";

    const ytId = extractYouTubeId(trimmed);
    if (ytId) return `https://www.youtube.com/watch?v=${encodeURIComponent(ytId)}`;

    const C = global.AscoltoContent;
    if (C && typeof C.extractGoogleDriveFileId === "function") {
      const fileId = C.extractGoogleDriveFileId(trimmed);
      if (fileId) {
        return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
      }
    }

    return trimmed;
  }

  function providerLabel(provider) {
    if (provider === "youtube") return "YouTube";
    if (provider === "drive") return "Google Drive";
    return "Link";
  }

  // Patch normalizeContent so courses are always normalized with exam data
  if (global.AscoltoContent && typeof global.AscoltoContent.normalizeContent === "function") {
    const original = global.AscoltoContent.normalizeContent;
    global.AscoltoContent.normalizeContent = function (raw) {
      return normalizeCourses(original(raw));
    };
  }

  global.AscoltoCourses = {
    normalizeCourses,
    ensureCourses,
    getCourse,
    createCourse,
    updateCourse,
    deleteCourse,
    createVideo,
    updateVideo,
    deleteVideo,
    extractYouTubeId,
    isYouTubeUrl,
    detectProvider,
    getEmbedUrl,
    getWatchUrl,
    providerLabel,
  };
})(window);
