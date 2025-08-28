const { getAuthenticatedClient } = require("../oauth");
const { getDriveClient, listFiles, findOrCreateFolder, FOLDER_NAME } = require("../drive-manager");
const { calculatePoseCounts, buildPhotoListHtml, buildPaginationHtml } = require("../utils/photo-utils");
const { filterPhotos } = require("../photo-manager");

async function filterByPose(req, ws, filters) {
  req.session.poseFilters = filters;
  const { allPhotos, search, status } = req.session;

  const oAuth2Client = await getAuthenticatedClient(req);
  const drive = await getDriveClient(oAuth2Client);
  const folder = await findOrCreateFolder(drive, FOLDER_NAME);
  const driveFiles = await listFiles(drive, folder.id);
  const downloadedFiles = new Set(driveFiles.map((f) => f.name));

  const filteredPhotos = filterPhotos(allPhotos, { search, status, filters, downloadedFiles });

  const page = 1;
  const pageSize = 50;
  const totalPages = Math.ceil(filteredPhotos.length / pageSize);
  const paginatedPhotos = filteredPhotos.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  const poseCounts = calculatePoseCounts(allPhotos.filter(p => downloadedFiles.has(`${p.photoId.id}.jpg`)));

  const photoListHtml = buildPhotoListHtml(paginatedPhotos, downloadedFiles);
  const paginationHtml = buildPaginationHtml(totalPages, page, 'changePage');

  ws.send(
    JSON.stringify({
      type: "filter-by-pose-results",
      payload: {
        photoListHtml,
        paginationHtml,
        poseCounts,
      },
    })
  );
}

module.exports = { filterByPose };
