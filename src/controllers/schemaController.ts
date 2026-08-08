import { Request, Response } from 'express';
import { prisma } from '../services/dbClient.js';

export async function getSchemaInspectorData(req: Request, res: Response) {
  try {
    const categories = await prisma.category.findMany();
    const menuItems = await prisma.menuItem.findMany();
    const modifierGroups = await prisma.modifierGroup.findMany();
    const modifierOptions = await prisma.modifierOption.findMany();
    const orders = await prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
    const orderItems = await prisma.orderItem.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
    const orderItemModifiers = await prisma.orderItemModifier.findMany();
    const orderEventLogs = await prisma.orderEventLog.findMany({ orderBy: { timestamp: 'desc' }, take: 30 });

    res.json({
      tables: {
        Category: { count: categories.length, rows: categories },
        MenuItem: { count: menuItems.length, rows: menuItems },
        ModifierGroup: { count: modifierGroups.length, rows: modifierGroups },
        ModifierOption: { count: modifierOptions.length, rows: modifierOptions },
        Order: { count: orders.length, rows: orders },
        OrderItem: { count: orderItems.length, rows: orderItems },
        OrderItemModifier: { count: orderItemModifiers.length, rows: orderItemModifiers },
        OrderEventLog: { count: orderEventLogs.length, rows: orderEventLogs }
      },
      erdSchema: {
        models: [
          { name: 'Category', fields: ['id', 'name', 'icon', 'displayOrder', 'createdAt'] },
          { name: 'MenuItem', fields: ['id', 'categoryId (FK)', 'name', 'description', 'basePrice', 'isAvailable', 'imageUrl'] },
          { name: 'ModifierGroup', fields: ['id', 'menuItemId (FK)', 'name', 'minSelect', 'maxSelect', 'required'] },
          { name: 'ModifierOption', fields: ['id', 'groupId (FK)', 'name', 'extraPrice'] },
          { name: 'Order', fields: ['id', 'orderNumber', 'customerName', 'status', 'subtotal', 'taxRate', 'taxAmount', 'tipAmount', 'totalAmount'] },
          { name: 'OrderItem', fields: ['id', 'orderId (FK)', 'menuItemId (FK)', 'quantity', 'unitPrice', 'subtotal', 'specialInstructions'] },
          { name: 'OrderItemModifier', fields: ['id', 'orderItemId (FK)', 'groupId', 'optionId', 'optionName', 'priceDelta'] },
          { name: 'OrderEventLog', fields: ['id', 'orderId (FK)', 'timestamp', 'speaker', 'utterance', 'actionType', 'stateDeltaJson'] }
        ],
        relations: [
          { from: 'MenuItem', to: 'Category', type: 'ManyToOne', fk: 'categoryId' },
          { from: 'ModifierGroup', to: 'MenuItem', type: 'ManyToOne', fk: 'menuItemId' },
          { from: 'ModifierOption', to: 'ModifierGroup', type: 'ManyToOne', fk: 'groupId' },
          { from: 'OrderItem', to: 'Order', type: 'ManyToOne', fk: 'orderId' },
          { from: 'OrderItem', to: 'MenuItem', type: 'ManyToOne', fk: 'menuItemId' },
          { from: 'OrderItemModifier', to: 'OrderItem', type: 'ManyToOne', fk: 'orderItemId' },
          { from: 'OrderEventLog', to: 'Order', type: 'ManyToOne', fk: 'orderId' }
        ]
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
