import { validateNovelUrl } from "./QueueInput.js";

// Store only source URLs, outcomes, and reports, never tokens, DOM nodes, or pages.
export function queueSnapshot(jobs) {
  return { version: 1, jobs: jobs.map(({ tocUrl, firstChapterUrl, title, customTitle, galleryOnlyFree, gallerySkipHiatus, galleryOnlyCompleted, error, status, report }) =>
    ({ tocUrl, firstChapterUrl, title, customTitle, galleryOnlyFree, gallerySkipHiatus, galleryOnlyCompleted, error, status, report })) };
}

export function restoreQueue(snapshot) {
  if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.jobs)) {
    throw new Error("The saved queue format is not supported. Your saved data has not been changed.");
  }
  return snapshot.jobs.map((entry) => {
    if (!entry || !["waiting", "paused", "loading", "compiling", "success", "warning", "failed", "stopped"].includes(entry.status)) {
      throw new Error("The saved queue contains an invalid entry. Your saved data has not been changed.");
    }
    const job = { ...entry };
    if ([job.galleryOnlyFree, job.gallerySkipHiatus, job.galleryOnlyCompleted].some(value => value !== undefined && typeof value !== "boolean")) {
      throw new Error("A saved novel's gallery filters are invalid. Your saved data has not been changed.");
    }
    if (job.customTitle !== undefined && typeof job.customTitle !== "string") {
      throw new Error("A saved novel's custom name is invalid. Your saved data has not been changed.");
    }
    if ((job.title !== undefined && typeof job.title !== "string") || (job.error !== undefined && typeof job.error !== "string")) {
      throw new Error("A saved novel's details are invalid. Your saved data has not been changed.");
    }
    if (!job.error || job.tocUrl) {
      job.tocUrl = validateNovelUrl(job.tocUrl);
      job.firstChapterUrl = job.firstChapterUrl ? validateNovelUrl(job.firstChapterUrl) : "";
    }
    if (job.report && (!Array.isArray(job.report.issues) || !job.report.issues.every((issue) => typeof issue === "string") ||
      !["selected", "compiled", "images", "savedImages"].every((key) => Number.isInteger(job.report[key]) && job.report[key] >= 0) ||
      typeof job.report.downloaded !== "boolean" || typeof job.report.stopped !== "boolean" ||
      (job.report.filename !== undefined && typeof job.report.filename !== "string"))) {
      throw new Error("A saved report is invalid. Your saved data has not been changed.");
    }
    if (["waiting", "loading", "compiling", "paused"].includes(job.status)) job.status = "paused";
    return job;
  });
}
