# Please implement the instructions below
1. Create new API endpoint with /api/config_speakers which this will be used by the frontend to POST with request body of id (id row in the meeting_bot_audio_transcript table), and participant list (in order) for you to update and replace the generic speakers from the raw_transcript column of the meeting_bot_audio_transcript table.
    ex. if there is identified speaker count of 3  
    participants{
        "Ron Llave",
        "Matthias Umpieriezz,
        "Emil Santos"
    }