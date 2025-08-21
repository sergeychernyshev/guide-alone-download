function calculatePoseCounts(photos) {
    const poseCounts = {
        heading: 0,
        pitch: 0,
        roll: 0,
        altitude: 0,
        latLngPair: 0,
    };

    photos.forEach(photo => {
        if (photo.pose) {
            if (typeof photo.pose.heading === 'number') poseCounts.heading++;
            if (typeof photo.pose.pitch === 'number') poseCounts.pitch++;
            if (typeof photo.pose.roll === 'number') poseCounts.roll++;
            if (typeof photo.pose.altitude === 'number') poseCounts.altitude++;
            if (photo.pose.latLngPair !== undefined) poseCounts.latLngPair++;
        }
    });

    return poseCounts;
}

module.exports = { calculatePoseCounts };
