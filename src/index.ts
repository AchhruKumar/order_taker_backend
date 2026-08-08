import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getMenu, createMenuItem, updateMenuItem, deleteMenuItem } from './controllers/menuController.js';
import { getCurrentOrder, processVoiceCommand, resetOrder, confirmOrder, getAllOrders, deleteOrder, deleteAllOrders } from './controllers/orderController.js';
import { getSchemaInspectorData } from './controllers/schemaController.js';
import { getGroqKeyStatus, updateGroqKey, getGroqQuota } from './controllers/configController.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'V1 Order Taker Backend', timestamp: new Date() });
});

app.get('/api/menu', getMenu);
app.post('/api/menu/items', createMenuItem);
app.put('/api/menu/items/:id', updateMenuItem);
app.delete('/api/menu/items/:id', deleteMenuItem);
app.get('/api/order/current', getCurrentOrder);
app.get('/api/orders', getAllOrders);
app.delete('/api/order/:id', deleteOrder);
app.delete('/api/orders', deleteAllOrders);
app.post('/api/order/voice-command', processVoiceCommand);
app.post('/api/order/reset', resetOrder);
app.post('/api/order/confirm', confirmOrder);
app.get('/api/schema', getSchemaInspectorData);

// Groq API Key management
app.get('/api/config/groq-key', getGroqKeyStatus);
app.put('/api/config/groq-key', updateGroqKey);
app.get('/api/config/groq-quota', getGroqQuota);

app.listen(PORT, () => {
  console.log(`⚡ Order Taker Express server running at http://localhost:${PORT}`);
});
