const ytdl = require('@distube/ytdl-core');

module.exports = {
    setupRoutes: (app) => {
        app.get('/api/media/youtube', (req, res) => {
            const videoUrl = req.query.url;
            if (!videoUrl) return res.status(400).send('Missing YouTube URL');
            
            console.log(`[YouTube Service] Streaming audio for: ${videoUrl}`);
            res.setHeader('Content-Type', 'audio/webm'); 
            
            try {
                const stream = ytdl(videoUrl, { filter: 'audioonly', quality: 'highestaudio' });
                stream.on('error', (err) => {
                    console.error('[YouTube Stream Error]', err.message);
                    if (!res.headersSent) res.status(500).send('Stream Failed: ' + err.message);
                });
                stream.pipe(res);
            } catch (err) {
                console.error('[YouTube Proxy Crash]', err);
                if (!res.headersSent) res.status(500).send('Proxy Error');
            }
        });
    }
};
