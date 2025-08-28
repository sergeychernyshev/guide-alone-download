let ws;

function getCurrentFilters() {
  const search = document.getElementById("search-input").value;
  const status = document
    .querySelector(".status-filter a.active")
    .id.replace("filter-", "");
  const poseFilters = Array.from(
    document.querySelectorAll('.pose-filter-group input[type="checkbox"]')
  )
    .filter((c) => c.dataset.state !== "any")
    .map((c) => ({ property: c.name, value: c.dataset.state }));
  const page = parseInt(
    new URLSearchParams(window.location.search).get("page") || "1",
    10
  );
  const sort = new URLSearchParams(window.location.search).get("sort") || "date";
  const order = new URLSearchParams(window.location.search).get("order") || "desc";
  return { search, status, poseFilters, page, sort, order };
}

function applyFilters(newFilters = {}) {
  const currentFilters = getCurrentFilters();
  const filters = { ...currentFilters, ...newFilters };

  const payload = {
    search: filters.search,
    status: filters.status,
    poseFilters: filters.poseFilters,
    page: filters.page,
    sort: filters.sort,
    order: filters.order,
    location: newFilters.location, // Pass location for scrolling
    isPopState: newFilters.isPopState, // Flag for history handling
  };

  connectWebSocket();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "filter-photos", payload }));
  } else {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "filter-photos", payload }));
    };
  }
}

function sortPhotos(sort) {
  const currentOrder = new URLSearchParams(window.location.search).get("order") || "desc";
  const currentSort = new URLSearchParams(window.location.search).get("sort") || "date";
  let order = "asc";
  if (currentSort === sort) {
    order = currentOrder === "asc" ? "desc" : "asc";
  }
  applyFilters({ sort, order });
}

function changePage(page, location) {
  applyFilters({ page, location });
}

function searchPhotos() {
  applyFilters({
    search: document.getElementById("search-input").value,
    page: 1,
  });
}

function filterPhotos(status) {
  document.querySelector(".status-filter a.active").classList.remove("active");
  document.getElementById(`filter-${status}`).classList.add("active");
  applyFilters({ status, page: 1 });
}

function filterByPose() {
  const poseFilters = Array.from(
    document.querySelectorAll('.pose-filter-group input[type="checkbox"]')
  )
    .filter((c) => c.dataset.state !== "any")
    .map((c) => ({ property: c.name, value: c.dataset.state }));
  applyFilters({ poseFilters, page: 1 });
}

function clearSearch() {
  document.getElementById("search-input").value = "";
  toggleClearButton();
  searchPhotos();
}

function resetFilters() {
  document.getElementById("search-input").value = "";
  document.querySelector(".status-filter a.active").classList.remove("active");
  document.getElementById("filter-all").classList.add("active");
  document
    .querySelectorAll('.pose-filter-group input[type="checkbox"]')
    .forEach((checkbox) => {
      setCheckboxState(checkbox, "any", true);
    });
  applyFilters({ search: "", status: "all", poseFilters: [], page: 1 });
}

function confirmDownload() {
  if (!isLoggedIn) return;
  const missingPhotosCount = missingPhotosCount;
  if (missingPhotosCount > 10) {
    if (
      !confirm(
        `You are about to download ${missingPhotosCount} photos. Are you sure you want to proceed?`
      )
    ) {
      return;
    }
  }
  document.getElementById("download-progress").style.display = "block";
  document.querySelector(".progress-bar-container").style.display = "block";
  document.getElementById("progress-text").style.display = "block";
  connectWebSocket();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "download" }));
  } else {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "download" }));
    };
  }
}

function updatePhotoList() {
  if (!isLoggedIn) return;
  const updateBtn = document.getElementById("update-btn");
  updateBtn.disabled = true;
  updateBtn.innerHTML = '<div class="spinner"></div><span>Starting...</span>';

  connectWebSocket();

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "update-photo-list" }));
  } else {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "update-photo-list" }));
    };
  }
}

function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(`ws://${window.location.host}`);
  ws.onopen = () => console.log("WebSocket connection established.");
  ws.onclose = () => console.log("WebSocket connection closed");
  ws.onerror = (error) => console.error("WebSocket error:", error);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "filter-results") {
      const {
        photoListHtml,
        paginationHtmlTop,
        paginationHtmlBottom,
        poseCounts,
        downloadedCount,
        notDownloadedCount,
        totalPhotosCount,
        startIndex,
        endIndex,
        filteredTotal,
        currentPage,
        totalPages,
        requestPayload,
      } = data.payload;

      // 1. Update DOM
      document.querySelector("tbody").innerHTML = photoListHtml;
      document.querySelectorAll(".pagination").forEach((el, i) => {
        el.innerHTML = i === 0 ? paginationHtmlTop : paginationHtmlBottom;
      });
      updatePoseCounts(poseCounts);
      document.getElementById("downloaded-count").textContent = downloadedCount;
      document.getElementById("not-downloaded-count").textContent =
        notDownloadedCount;
      document.getElementById("all-count").textContent = totalPhotosCount;
      if (filteredTotal > 0) {
        document.getElementById(
          "photo-counter"
        ).textContent = `Showing photos ${startIndex}-${endIndex} (page ${currentPage} of ${totalPages}) out of ${filteredTotal} filtered photos.`;
      } else {
        document.getElementById("photo-counter").textContent =
          "No photos match the current filters.";
      }

      // 2. Update URL (if not a popstate event)
      if (!requestPayload.isPopState) {
        const params = new URLSearchParams();
        if (requestPayload.search) params.set("search", requestPayload.search);
        if (requestPayload.status !== "all")
          params.set("status", requestPayload.status);
        const poseQuery = requestPayload.poseFilters
          .map((f) => `${f.property}:${f.value}`)
          .join(",");
        if (poseQuery) params.set("pose", poseQuery);
        if (requestPayload.page > 1) params.set("page", requestPayload.page);

        const newQueryString = params.toString()
          ? `?${params.toString()}`
          : window.location.pathname;
        if (newQueryString !== `${window.location.search}`) {
          history.pushState(null, "", newQueryString);
        }
      }

      // 3. Scroll if needed
      if (requestPayload.location === "bottom") {
        window.scrollTo(0, 0);
      }
      return;
    }

    // Handle other WebSocket messages (download progress, etc.)
    // ...
  };
}

function updatePoseCounts(poseCounts) {
  for (const property in poseCounts) {
    const checkbox = document.querySelector(`input[name="${property}"]`);
    if (checkbox) {
      const group = checkbox.closest(".pose-filter-group");
      const countSpan = group.querySelector(".pose-filter-count");
      countSpan.textContent = `(${poseCounts[property].exists})`;
    }
  }
}

function toggleClearButton() {
  const searchInput = document.getElementById("search-input");
  const clearButton = document.getElementById("clear-search-btn");
  clearButton.style.display = searchInput.value ? "block" : "none";
}

function setCheckboxState(checkbox, state, silent = false) {
  checkbox.dataset.state = state;
  if (state === "any") {
    checkbox.checked = false;
    checkbox.indeterminate = false;
  } else if (state === "exists") {
    checkbox.checked = true;
    checkbox.indeterminate = false;
  } else if (state === "missing") {
    checkbox.checked = false;
    checkbox.indeterminate = true;
  }
  const label = checkbox.closest("label");
  const valueSpan = label.querySelector(".pose-filter-value");
  valueSpan.textContent =
    state === "any" ? "Any" : state === "exists" ? "Exists" : "Doesn't Exist";
  if (!silent) {
    filterByPose();
  }
}

function cycleCheckboxState(checkbox, silent = false) {
  const states = ["any", "exists", "missing"];
  const currentState = checkbox.dataset.state;
  const nextStateIndex = (states.indexOf(currentState) + 1) % states.length;
  setCheckboxState(checkbox, states[nextStateIndex], silent);
}

document.addEventListener("DOMContentLoaded", () => {
  function getFiltersFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return {
      search: params.get("search") || "",
      status: params.get("status") || "all",
      pose: params.get("pose")?.split(",").filter(Boolean) || [],
      page: parseInt(params.get("page") || "1", 10),
    };
  }

  window.addEventListener("popstate", (event) => {
    const filters = getFiltersFromQuery();
    document.getElementById("search-input").value = filters.search;
    document
      .querySelector(".status-filter a.active")
      .classList.remove("active");
    document.getElementById(`filter-${filters.status}`).classList.add("active");
    document
      .querySelectorAll('.pose-filter-group input[type="checkbox"]')
      .forEach((checkbox) => {
        const poseFilter = filters.pose.find((p) =>
          p.startsWith(checkbox.name)
        );
        const newState = poseFilter ? poseFilter.split(":")[1] : "any";
        setCheckboxState(checkbox, newState, true);
      });
    applyFilters({ ...filters, isPopState: true });
  });

  const filters = getFiltersFromQuery();
  document.getElementById("search-input").value = filters.search;
  document.querySelector(".status-filter a.active").classList.remove("active");
  document.getElementById(`filter-${filters.status}`).classList.add("active");
  document
    .querySelectorAll('.pose-filter-group input[type="checkbox"]')
    .forEach((checkbox) => {
      const poseFilter = filters.pose.find((p) => p.startsWith(checkbox.name));
      if (poseFilter) {
        const [, value] = poseFilter.split(":");
        setCheckboxState(checkbox, value, true);
      }
    });

  updatePoseCounts(poseCounts);
  toggleClearButton();

  if (downloadState.inProgress) {
    document.getElementById("download-progress").style.display = "block";
    connectWebSocket();
  }
});
