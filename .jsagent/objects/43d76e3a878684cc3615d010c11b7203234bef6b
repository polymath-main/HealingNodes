const ytdl = require('ytdl-core');

module.exports = {
    setupRoutes: (app) => {
        app.get('/api/media/youtube', (req, res) => {
            const videoUrl = req.query.url;
            if (!videoUrl) return res.status(400).send('Missing YouTube URL');
            
            console.log(`[YouTube Service] Streaming audio for: ${videoUrl}`);
            res.setHeader('Content-Type', 'audio/webm'); // ytdl-core audioonly is often webm
            
            try {
                ytdl(videoUrl, { filter: 'audioonly', quality: 'highestaudio' })
                    .pipe(res)
                    .on('error', (err) => console.error('[YouTube Stream Error]', err));
            } catch (err) {
                console.error('[YouTube Proxy Crash]', err);
                res.status(500).send('Stream Failed');
            }
        });
    }
};
