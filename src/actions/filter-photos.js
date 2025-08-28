const { getAuthenticatedClient } = require("../oauth");
const { getDriveClient, listFiles, findOrCreateFolder, FOLDER_NAME } = require("../drive-manager");
const { buildPhotoListHtml, buildPaginationHtml, calculatePoseCounts } = require("../utils/photo-utils");

async function filterPhotos(req, ws, payload) {
  const { search, status, poseFilters, page } = payload;
  const { allPhotos } = req.session;

  const oAuth2Client = await getAuthenticatedClient(req);
  const drive = await getDriveClient(oAuth2Client);
  const folder = await findOrCreateFolder(drive, FOLDER_NAME);
  const driveFiles = await listFiles(drive, folder.id);
  const downloadedFiles = new Set(driveFiles.map((f) => f.name));

  // Calculate unfiltered counts
  const totalPhotosCount = allPhotos.length;
  const downloadedCount = allPhotos.filter(p => downloadedFiles.has(`${p.photoId.id}.jpg`)).length;
  const notDownloadedCount = totalPhotosCount - downloadedCount;

  // 1. Filter by search term
  const searchedPhotos = allPhotos.filter(photo => {
    if (!search) return true;
    if (photo.places && photo.places.length > 0 && photo.places[0].name) {
      return photo.places[0].name.toLowerCase().includes(search.toLowerCase());
    }
    return false;
  });

  // 2. Filter by download status
  const statusFilteredPhotos = searchedPhotos.filter(photo => {
    if (status === 'all') return true;
    const isDownloaded = downloadedFiles.has(`${photo.photoId.id}.jpg`);
    return status === 'downloaded' ? isDownloaded : !isDownloaded;
  });

  // 3. Filter by pose
  const poseFilteredPhotos = statusFilteredPhotos.filter(photo => {
    if (!poseFilters || poseFilters.length === 0) return true;
    return poseFilters.every(filter => {
      if (filter.value === 'any') return true;
      const exists = filter.property === 'latLngPair'
        ? photo.pose && photo.pose.latLngPair !== undefined
        : photo.pose && typeof photo.pose[filter.property] === 'number';
      return filter.value === 'exists' ? exists : !exists;
    });
  });

  // 4. Paginate
  const photos = poseFilteredPhotos;
  const pageSize = 50;
  const totalPages = Math.ceil(photos.length / pageSize);
  const currentPage = page || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedPhotos = photos.slice(startIndex, endIndex);

  const photoListHtml = buildPhotoListHtml(paginatedPhotos, downloadedFiles);
  const paginationHtml = buildPaginationHtml(totalPages, currentPage, 'changePage');
  const poseCounts = calculatePoseCounts(allPhotos);

  ws.send(
    JSON.stringify({
      type: "filter-results",
      payload: {
        photoListHtml,
        paginationHtml,
        poseCounts,
        downloadedCount,
        notDownloadedCount,
        totalPhotosCount,
        startIndex: startIndex + 1,
        endIndex: Math.min(endIndex, photos.length),
        filteredTotal: photos.length,
        currentPage,
        totalPages,
      },
    })
  );
}

module.exports = { filterPhotos };