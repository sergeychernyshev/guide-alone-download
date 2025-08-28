const { getAuthenticatedClient } = require("../oauth");
const { getDriveClient, listFiles, findOrCreateFolder, FOLDER_NAME } = require("../drive-manager");
const { calculatePoseCounts, buildPhotoListHtml, buildPaginationHtml } = require("../utils/photo-utils");
const photoManager = require('../photo-manager');

async function searchPhotos(req, ws, payload) {
  const { search, page } = payload;
  req.session.search = search;

  const { allPhotos, status } = req.session;

  const filteredByStatusPhotos = photoManager.filterPhotos(allPhotos, status);
  const filteredPhotos = photoManager.searchPhotos(filteredByStatusPhotos, search);

  const currentPage = page || 1;
  const pageSize = 50;
  const totalPages = Math.ceil(filteredPhotos.length / pageSize);
  const paginatedPhotos = filteredPhotos.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
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
  const paginationHtml = buildPaginationHtml(totalPages, currentPage, 'changePage');

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
        newCurrentPage: currentPage,
      },
    })
  );
}

module.exports = { searchPhotos };