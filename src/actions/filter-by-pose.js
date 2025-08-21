const { getAuthenticatedClient } = require("../oauth");
const { getDriveClient, listFiles, findOrCreateFolder, FOLDER_NAME } = require("../drive-manager");

async function filterByPose(req, ws, filters) {
  req.session.poseFilters = filters;
  const { allPhotos, search, status } = req.session;

  const filteredBySearch = allPhotos.filter(photo => {
    if (!search) {
      return true;
    }
    if (photo.places && photo.places.length > 0 && photo.places[0].name) {
      return photo.places[0].name.toLowerCase().includes(search.toLowerCase());
    }
    return false;
  });

  const oAuth2Client = await getAuthenticatedClient(req);
  const drive = await getDriveClient(oAuth2Client);
  const folder = await findOrCreateFolder(drive, FOLDER_NAME);
  const driveFiles = await listFiles(drive, folder.id);
  const downloadedFiles = new Set(driveFiles.map((f) => f.name));

  const filteredByStatus = filteredBySearch.filter(photo => {
    if (status === 'all') {
      return true;
    }
    const isDownloaded = downloadedFiles.has(`${photo.photoId.id}.jpg`);
    return status === 'downloaded' ? isDownloaded : !isDownloaded;
  });

  const filteredByPose = filteredByStatus.filter(photo => {
    if (!filters || filters.length === 0) {
      return true;
    }
    return filters.every(filter => {
      if (filter === 'latLngPair') {
        return photo.pose && photo.pose.latLngPair !== undefined;
      }
      return photo.pose && typeof photo.pose[filter] === 'number'
    });
  });

  const page = 1;
  const pageSize = 50;
  const totalPages = Math.ceil(filteredByPose.length / pageSize);
  const paginatedPhotos = filteredByPose.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const photoListHtml = paginatedPhotos
    .map(
      (photo) => `
    <tr>
      <td><a href="${photo.shareLink}" target="_blank">${photo.photoId.id}</a></td>
      <td>${
        photo.places && photo.places.length > 0 && photo.places[0].name
          ? `${photo.places[0].name}<br><small>${photo.pose.latLngPair.latitude.toFixed(4)}, ${photo.pose.latLngPair.longitude.toFixed(4)}</small>`
          : `${photo.pose.latLngPair.latitude.toFixed(4)}, ${photo.pose.latLngPair.longitude.toFixed(4)}`
      }</td>
      <td>${new Date(photo.captureTime).toLocaleDateString()}</td>
      <td>${photo.viewCount || 0}</td>
      <td>${
        downloadedFiles.has(`${photo.photoId.id}.jpg`)
          ? '<span class="status downloaded" title="Downloaded"><span class="status-text">Downloaded</span><span class="status-icon">&#10004;</span></span>'
          : '<span class="status not-downloaded" title="Not Downloaded"><span class="status-text">Not Downloaded</span><span class="status-icon">&#10006;</span></span>'
      }</td>
      <td>
        <button onclick="downloadSinglePhoto('${photo.photoId.id}')" class="button ${
          downloadedFiles.has(`${photo.photoId.id}.jpg`) ? 'redownload-btn' : 'download-btn'
        }" style="font-size: 12px; padding: 5px 10px;" title="${downloadedFiles.has(`${photo.photoId.id}.jpg`) ? 'Re-download' : 'Download'}">
          <span class="button-text">${downloadedFiles.has(`${photo.photoId.id}.jpg`) ? 'Re-download' : 'Download'}</span>
          <span class="button-icon">${downloadedFiles.has(`${photo.photoId.id}.jpg`) ? '&#10227;' : '&#11015;'}</span>
        </button>
      </td>
    </tr>
  `
    )
    .join("");

  let paginationHtml = "";
  if (totalPages > 1) {
    const buildPageClick = (page) => {
      return `onclick="changePage(${page})"`;
    };

    paginationHtml += '<div class="pagination">';
    if (page > 1) {
      paginationHtml += `<button ${buildPageClick(page - 1)}>Previous</button>`;
    }

    const maxPagesToShow = 10;
    let startPage, endPage;

    if (totalPages <= maxPagesToShow) {
      startPage = 1;
      endPage = totalPages;
    } else {
      const maxPagesBeforeCurrent = Math.floor(maxPagesToShow / 2);
      const maxPagesAfterCurrent = Math.ceil(maxPagesToShow / 2) - 1;
      if (page <= maxPagesBeforeCurrent) {
        startPage = 1;
        endPage = maxPagesToShow;
      } else if (page + maxPagesAfterCurrent >= totalPages) {
        startPage = totalPages - maxPagesToShow + 1;
        endPage = totalPages;
      } else {
        startPage = page - maxPagesBeforeCurrent;
        endPage = page + maxPagesAfterCurrent;
      }
    }

    if (startPage > 1) {
      paginationHtml += `<button ${buildPageClick(1)}>1</button>`;
      if (startPage > 2) {
        paginationHtml += `<span>...</span>`;
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      if (i === page) {
        paginationHtml += `<button disabled>${i}</button>`;
      } else {
        paginationHtml += `<button ${buildPageClick(i)}>${i}</button>`;
      }
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        paginationHtml += `<span>...</span>`;
      }
      paginationHtml += `<button ${buildPageClick(totalPages)}>${totalPages}</button>`;
    }

    if (page < totalPages) {
      paginationHtml += `<button ${buildPageClick(page + 1)}>Next</button>`;
    }
    paginationHtml += "</div>";
  }

  ws.send(
    JSON.stringify({
      type: "filter-by-pose-results",
      payload: {
        photoListHtml,
        paginationHtml,
      },
    })
  );
}

module.exports = { filterByPose };
