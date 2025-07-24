Please analyze and fix.
1. request body format being send by the frontend for post request of the api/transcribe/raw endpoint (The participants is a list but currently there is one active participant for testing purpose)
 Endpoint: https://live-transcript-service-backend.dev.singularity-works.com/api/transcribe/raw
Request Body: {
  "audioUrl": "https://meeting-bot-backend.dev.singularity-works.com/api/google-meet-guest/audio-blob/guest_bot_1753335327768_w2wf8g",
  "participants": [
    {
      "name": "roncymondllave25@gmail.com",
      "email": "",
      "role": "participant"
    }
  ],
  "eventId": "24g8p26poeo3507622mo8tt9cj",
  "meetingUrl": "https://meet.google.com/pxz-pgkb-znf",
  "botId": "guest_bot_1753335327768_w2wf8g"
}
Audio Blob URL: https://meeting-bot-backend.dev.singularity-works.com/api/google-meet-guest/audio-blob/guest_bot_1753335327768_w2wf8g
Participants: [ { name: 'roncymondllave25@gmail.com', email: '' } ]
Event ID: 24g8p26poeo3507622mo8tt9cj

2. Actual audio to text transcript but most of the dialogues are showing with unknown, even if there is a participant name given.
Unknown
00:05
Hello, hello.

roncymondllave25@gmail.com
00:12
Well, it's still unknown.

roncymondllave25@gmail.com
00:15
Hello, my name is Ron Simon Jabe.

roncymondllave25@gmail.com
00:19
My name is Ron Simon Jabe.

Speaker 1
00:22
Oh, you're okay. So you are using the email.

Speaker 1
00:27
Hey, why speaker one, two.

Speaker 1
00:31
I see.

Speaker 1
00:33
Okay, it's already 1:36 p.m.

Speaker 1
00:38
and currently

Speaker 1
00:41
Okay, um

Speaker 1
00:46
Okay, so

Speaker 1
00:48
Okay, okay, yes.

Speaker 1
00:51
Yes, yes, sorry.

roncymondllave25@gmail.com
02:23
I'd rather have bad times with you than good times without you.

roncymondllave25@gmail.com
02:44
Okay.

Speaker 1
02:45
Okay, it's currently patching.

Speaker 1
02:50
Hello, hello.

Speaker 1
03:17
Okay.

Speaker 1
03:20
Nice, nice.

Speaker 1
03:21
Okay, it's already 1:26 p.m.

Speaker 1
03:27
Okay.

Speaker 1
03:28
Oops.

Speaker 1
03:29
Okay.

roncymondllave25@gmail.com
04:20
My name is Ron Simon Jabe.

roncymondllave25@gmail.com
04:50
No problem, dude.

Speaker 1
05:06
