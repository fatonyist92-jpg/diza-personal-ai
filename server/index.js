import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors());

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'diza-realtime-gateway',
    version: '0.2.1'
  });
});

app.get('/token', async (_req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY belum diset di server.'
    });
  }

  const payload = {
    session: {
      type: 'realtime',
      model: process.env.DIZA_REALTIME_MODEL || 'gpt-realtime-1.5',
      output_modalities: ['audio'],
      instructions: [
        'Nama kamu Diza.',
        'Kamu adalah personal AI assistant milik Fatoni.',
        'Gunakan bahasa Indonesia santai gaya gue-lu yang natural.',
        'Jangan kaku, jangan terdengar seperti robot, dan jangan terlalu formal.',
        'Nada bicara lembut, tenang, hangat, tertata, dan tidak terlalu cepat.',
        'Jangan memanggil pengguna dengan kata sayang.',
        'Panggil pengguna Fatoni.',
        'Kamu bisa membantu kebutuhan umum, project, hobi, dan pekerjaan engineering/automation.',
        'Kalau ada hal yang tidak diketahui, bilang apa adanya dan jangan mengarang.'
      ].join(' '),
      audio: {
        input: {
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 450,
            create_response: true,
            interrupt_response: true
          },
          transcription: {
            model: 'gpt-transcribe',
            language: 'id'
          }
        },
        output: {
          voice: process.env.DIZA_VOICE || 'marin'
        }
      }
    }
  };

  try {
    const upstream = await fetch(
      'https://api.openai.com/v1/realtime/client_secrets',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'OpenAI-Safety-Identifier':
            process.env.DIZA_SAFETY_IDENTIFIER || 'diza-personal-user-v1'
        },
        body: JSON.stringify(payload)
      }
    );

    const body = await upstream.text();

    if (!upstream.ok) {
      console.error('OpenAI client secret error', upstream.status, body);
      return res.status(upstream.status)
        .type('application/json')
        .send(body);
    }

    res.type('application/json').send(body);
  } catch (error) {
    console.error(error);
    res.status(502).json({
      error: 'Realtime token gateway error',
      detail: error?.message || String(error)
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log('Diza Realtime gateway listening on :' + port);
});
