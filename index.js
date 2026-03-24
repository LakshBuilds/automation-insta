import pkg from "googleapis";
const { google } = pkg;
import fs from "fs";
import { exec } from "child_process";
import axios from "axios";
import FormData from "form-data";
import dotenv from "dotenv";

dotenv.config();

// 🔑 Google Auth
const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

const SPREADSHEET_ID = "1YqvnDGNRXH-g2hp51GxNAScrdU6wJcNzKmLCxIJ_NBg";
const RANGE = "Sheet1!A2:F";

// 📥 STEP 1: Get pending row
async function getPendingRow() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE,
  });

  const rows = res.data.values;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i][2] === "pending") {
      return { row: rows[i], index: i + 2 };
    }
  }
}

// 🎥 STEP 2: Download reel
function downloadVideo(url) {
  return new Promise((resolve) => {
    exec(`yt-dlp "${url}" -o video.mp4`, () => {
      resolve();
    });
  });
}

// 🎵 STEP 3: Extract audio
function extractAudio() {
  return new Promise((resolve) => {
    exec(
      "ffmpeg -i video.mp4 -q:a 0 -map a audio.mp3",
      () => resolve()
    );
  });
}

// 🗣️ STEP 4: Speech to text
async function transcribe() {
  const form = new FormData();
  form.append("file", fs.createReadStream("audio.mp3"));
  form.append("model", "whisper-1");

  const res = await axios.post(
    "https://api.openai.com/v1/audio/transcriptions",
    form,
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        ...form.getHeaders(),
      },
    }
  );

  return res.data.text;
}

// 🤖 STEP 5: Wavespeed caption
async function generateCaption(text) {
  const res = await axios.post(
    "https://api.wavespeed.ai/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Create viral caption + hashtags:\n${text}`,
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}`,
      },
    }
  );

  return res.data.choices[0].message.content;
}

// 📊 STEP 6: Update sheet
async function updateSheet(rowIndex, caption) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Sheet1!D${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[caption]],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Sheet1!C${rowIndex}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [["done"]],
    },
  });
}

// 🚀 MAIN
async function main() {
  const data = await getPendingRow();

  if (!data) {
    console.log("No pending reels");
    return;
  }

  const url = data.row[1];
  console.log("Processing:", url);

  await downloadVideo(url);
  await extractAudio();

  const text = await transcribe();
  const caption = await generateCaption(text);

  console.log("Caption:", caption);

  await updateSheet(data.index, caption);

  console.log("DONE 🚀");
}

main();