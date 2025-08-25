const { getAuthenticatedClient } = require("../oauth");
const { getDriveClient, listFiles, findOrCreateFolder, FOLDER_NAME } = require("../drive-manager");
const { calculatePoseCounts, buildPhotoListHtml } = require("../utils/photo-utils");

async function searchPhotos(req, ws, search) {
  req.session.search = search;
  const { allPhotos } = req.session;

  const filteredPhotos = allPhotos.filter(photo => {
    if (!search) {
      return true;
    }
    if (photo.places && photo.places.length > 0 && photo.places[0].name) {
      return photo.places[0].name.toLowerCase().includes(search.toLowerCase());
    }
    return false;
  });

  const page = 1;
  const pageSize = 50;
  const totalPages = Math.ceil(filteredPhotos.length / pageSize);
  const paginatedPhotos = filteredPhotos.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const oAuth2Client = await getAuthenticatedClient(req);
  const drive = await getDriveClient(oAuth2Client);
  const folder = await findOrCreateFolder(drive, FOLDER_NAME);
  const driveFiles = await listFiles(drive, folder.id);
  const downloadedFiles = new Set(driveFiles.map((f) => f.name));

  const downloadedPhotos = filteredPhotos.filter((p) =>
    downloadedFiles.has(`${p.photoId.id}.jpg`)
  );
  const missingPhotos = filteredPhotos.filter(
    (p) => !downloadedFiles.has(`${p.photoId.id}.jpg`)
  );

  const downloadedCount = downloadedPhotos.length;
  const notDownloadedCount = missingPhotos.length;
  const totalPhotosCount = filteredPhotos.length;
  const poseCounts = calculatePoseCounts(filteredPhotos);

  const photoListHtml = buildPhotoListHtml(paginatedPhotos, downloadedFiles);

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
      type: "search-results",
      payload: {
        photoListHtml,
        paginationHtml,
        downloadedCount,
        notDownloadedCount,
        totalPhotosCount,
        poseCounts,
      },
    })
  );
}

module.exports = { searchPhotos };
