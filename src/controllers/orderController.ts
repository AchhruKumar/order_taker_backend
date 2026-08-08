import { Request, Response } from 'express';
import { prisma } from '../services/dbClient.js';
import { processVoiceUtteranceWithGrok } from '../services/grokService.js';
import { applyAIOrderAction, getOrCreateActiveOrder, recalculateOrderTotals } from '../services/orderService.js';

export async function getCurrentOrder(req: Request, res: Response) {
  try {
    const order = await getOrCreateActiveOrder();
    res.json({ order });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function processVoiceCommand(req: Request, res: Response) {
  try {
    const { utterance } = req.body;
    const apiKeyHeader = req.headers['x-groq-api-key'] as string | undefined;

    if (!utterance || typeof utterance !== 'string') {
      return res.status(400).json({ error: 'Utterance string is required' });
    }

    const currentOrder = await getOrCreateActiveOrder();
    const categories = await prisma.category.findMany({
      include: {
        items: {
          include: {
            modifierGroups: { include: { options: true } }
          }
        }
      }
    });

    const aiResult = await processVoiceUtteranceWithGrok(
      utterance,
      currentOrder,
      categories,
      apiKeyHeader
    );

    const updatedOrder = await applyAIOrderAction(utterance, aiResult);

    res.json({
      aiResponse: aiResult,
      order: updatedOrder
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function resetOrder(req: Request, res: Response) {
  try {
    const order = await getOrCreateActiveOrder();

    await prisma.orderItemModifier.deleteMany({
      where: { orderItem: { orderId: order.id } }
    });
    await prisma.orderItem.deleteMany({
      where: { orderId: order.id }
    });
    await prisma.orderEventLog.deleteMany({
      where: { orderId: order.id }
    });

    await recalculateOrderTotals(order.id);
    const updated = await getOrCreateActiveOrder();

    res.json({ order: updated, message: 'Order reset successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function confirmOrder(req: Request, res: Response) {
  try {
    const activeOrder = await getOrCreateActiveOrder();

    if (!activeOrder.items || activeOrder.items.length === 0) {
      return res.status(400).json({ error: 'Cannot confirm an empty cart' });
    }

    const { tipAmount } = req.body;
    const finalTip = typeof tipAmount === 'number' ? tipAmount : activeOrder.tipAmount;
    const finalTotal = Math.round((activeOrder.subtotal + activeOrder.taxAmount + finalTip) * 100) / 100;

    const confirmed = await prisma.order.update({
      where: { id: activeOrder.id },
      data: {
        status: 'CONFIRMED',
        tipAmount: finalTip,
        totalAmount: finalTotal
      },
      include: {
        items: {
          include: {
            menuItem: true,
            modifiers: true
          }
        }
      }
    });

    await prisma.orderEventLog.create({
      data: {
        orderId: confirmed.id,
        speaker: 'USER',
        utterance: 'Confirm Order button clicked',
        actionType: 'CONFIRM_ORDER',
        stateDeltaJson: JSON.stringify({ status: 'CONFIRMED', total: finalTotal })
      }
    });

    // Create fresh next draft order
    const nextOrder = await getOrCreateActiveOrder();

    res.json({
      success: true,
      confirmedOrder: confirmed,
      newOrder: nextOrder
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getAllOrders(req: Request, res: Response) {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            menuItem: true,
            modifiers: true
          }
        },
        eventsLog: {
          orderBy: { timestamp: 'desc' },
          take: 10
        }
      }
    });

    res.json({ orders });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteOrder(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Order ID is required' });

    await prisma.orderItemModifier.deleteMany({
      where: { orderItem: { orderId: id } }
    });
    await prisma.orderItem.deleteMany({
      where: { orderId: id }
    });
    await prisma.orderEventLog.deleteMany({
      where: { orderId: id }
    });
    await prisma.order.delete({
      where: { id }
    });

    res.json({ success: true, message: `Order ${id} deleted` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteAllOrders(req: Request, res: Response) {
  try {
    await prisma.orderItemModifier.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.orderEventLog.deleteMany();
    await prisma.order.deleteMany();

    // Ensure a fresh active draft order exists
    const freshOrder = await getOrCreateActiveOrder();

    res.json({ success: true, message: 'All order history deleted', newOrder: freshOrder });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}


