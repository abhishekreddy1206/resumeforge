(function (global) {
  function classifyCaptureDuplicate(details, captureType) {
    if (details?.duplicateKind === "saved-source" || details?.duplicateKind === "job") {
      return details.duplicateKind;
    }
    return captureType === "article" ? "saved-source" : "job";
  }

  function buildDuplicateReviewUrl(apiBase, details, captureType) {
    if (details?.reviewUrl) {
      return `${apiBase}${details.reviewUrl}`;
    }
    if (classifyCaptureDuplicate(details, captureType) === "saved-source" && details?.existingSourceId) {
      return `${apiBase}/learn/sources/${details.existingSourceId}`;
    }
    if (details?.existingJobId) {
      return `${apiBase}/jobs?jobId=${encodeURIComponent(details.existingJobId)}`;
    }
    return `${apiBase}/jobs`;
  }

  const api = {
    classifyCaptureDuplicate,
    buildDuplicateReviewUrl,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.ResumeForgePopupHelpers = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
