import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getGroqQuotaInfo } from '../services/grokService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '../../.env');

export function getGroqKeyStatus(req: Request, res: Response) {
  const key = process.env.GROQ_API_KEY || '';
  res.json({
    hasKey: key.length > 0,
    apiKey: key,
    keyPreview: key.length > 8 ? `${key.slice(0, 8)}...${key.slice(-4)}` : ''
  });
}

export function getGroqQuota(req: Request, res: Response) {
  const quota = getGroqQuotaInfo();
  res.json({ quota });
}

export function updateGroqKey(req: Request, res: Response) {
  try {
    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return res.status(400).json({ error: 'Valid API key is required' });
    }

    const trimmedKey = apiKey.trim();

    // Update in memory immediately (no restart needed)
    process.env.GROQ_API_KEY = trimmedKey;

    // Also persist to .env file reliably
    let envContent = '';
    if (fs.existsSync(ENV_PATH)) {
      envContent = fs.readFileSync(ENV_PATH, 'utf-8');
      // Remove any commented or active GROQ_API_KEY line first
      envContent = envContent.replace(/^#?\s*GROQ_API_KEY=.*$/gm, '').trim();
    }
    envContent = (envContent ? envContent + '\n' : '') + `GROQ_API_KEY="${trimmedKey}"\n`;
    fs.writeFileSync(ENV_PATH, envContent, 'utf-8');

    console.log(`🔑 GROQ_API_KEY updated live: ${trimmedKey.slice(0, 8)}...`);
    res.json({
      success: true,
      message: 'Groq API key updated successfully',
      apiKey: trimmedKey,
      keyPreview: `${trimmedKey.slice(0, 8)}...${trimmedKey.slice(-4)}`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
