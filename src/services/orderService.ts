import { prisma } from './dbClient.js';
import { AIOrderResponse } from './grokService.js';

export async function getOrCreateActiveOrder() {
  let order = await prisma.order.findFirst({
    where: { status: 'DRAFT' },
    include: {
      items: {
        include: {
          menuItem: true,
          modifiers: true
        }
      },
      eventsLog: {
        orderBy: { timestamp: 'desc' },
        take: 20
      }
    }
  });

  if (!order) {
    const lastOrder = await prisma.order.findFirst({
      orderBy: { orderNumber: 'desc' }
    });

    const nextOrderNumber = lastOrder ? lastOrder.orderNumber + 1 : 1001;

    order = await prisma.order.create({
      data: {
        orderNumber: nextOrderNumber,
        customerName: 'Guest Customer',
        status: 'DRAFT',
        subtotal: 0.0,
        taxAmount: 0.0,
        tipAmount: 0.0,
        totalAmount: 0.0
      },
      include: {
        items: {
          include: {
            menuItem: true,
            modifiers: true
          }
        },
        eventsLog: {
          orderBy: { timestamp: 'desc' },
          take: 20
        }
      }
    });
  }

  return order;
}

export async function applyAIOrderAction(
  utterance: string,
  aiResult: AIOrderResponse
) {
  const order = await getOrCreateActiveOrder();
  let stateDelta: any = {};

  if (aiResult.action === 'RESET_ORDER') {
    await prisma.orderItemModifier.deleteMany({
      where: { orderItem: { orderId: order.id } }
    });
    await prisma.orderItem.deleteMany({
      where: { orderId: order.id }
    });

    await recalculateOrderTotals(order.id);

    stateDelta = { reset: true, message: 'Cart cleared' };
  } else if (aiResult.action === 'CONFIRM_ORDER') {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CONFIRMED' }
    });

    stateDelta = { status: 'CONFIRMED' };
  } else if (aiResult.action === 'ADD_ITEM' && aiResult.items) {
    const addedItemsLog: any[] = [];

    for (const itemReq of aiResult.items) {
      // Find matching menu item with case-insensitive search and fallback
      let menuItem = await prisma.menuItem.findFirst({
        where: {
          name: {
            contains: itemReq.itemName,
            mode: 'insensitive'
          }
        },
        include: {
          modifierGroups: {
            include: {
              options: true
            }
          }
        }
      });

      if (!menuItem) {
        const allItems = await prisma.menuItem.findMany({
          include: { modifierGroups: { include: { options: true } } }
        });
        const reqLower = itemReq.itemName.toLowerCase();
        menuItem = allItems.find(m =>
          m.name.toLowerCase().includes(reqLower) ||
          reqLower.includes(m.name.toLowerCase())
        ) || null;
      }

      if (menuItem) {
        let itemSubtotal = menuItem.basePrice * (itemReq.quantity || 1);
        const modifiersToCreate: any[] = [];

        // Check for size option
        if (itemReq.size) {
          for (const group of menuItem.modifierGroups) {
            const sizeOption = group.options.find(
              o => o.name.toLowerCase().includes(itemReq.size!.toLowerCase())
            );
            if (sizeOption) {
              modifiersToCreate.push({
                groupId: group.id,
                optionId: sizeOption.id,
                optionName: sizeOption.name,
                priceDelta: sizeOption.extraPrice
              });
              itemSubtotal += sizeOption.extraPrice * (itemReq.quantity || 1);
            }
          }
        }

        // Check for other modifiers
        if (itemReq.modifiers) {
          for (const modName of itemReq.modifiers) {
            for (const group of menuItem.modifierGroups) {
              const matchedOption = group.options.find(
                o => o.name.toLowerCase().includes(modName.toLowerCase())
              );
              if (matchedOption) {
                modifiersToCreate.push({
                  groupId: group.id,
                  optionId: matchedOption.id,
                  optionName: matchedOption.name,
                  priceDelta: matchedOption.extraPrice
                });
                itemSubtotal += matchedOption.extraPrice * (itemReq.quantity || 1);
              }
            }
          }
        }

        const createdItem = await prisma.orderItem.create({
          data: {
            orderId: order.id,
            menuItemId: menuItem.id,
            quantity: itemReq.quantity || 1,
            unitPrice: menuItem.basePrice,
            subtotal: itemSubtotal,
            specialInstructions: itemReq.specialInstructions || null,
            modifiers: {
              create: modifiersToCreate
            }
          },
          include: {
            menuItem: true,
            modifiers: true
          }
        });

        addedItemsLog.push({
          id: createdItem.id,
          name: menuItem.name,
          quantity: createdItem.quantity,
          subtotal: itemSubtotal,
          modifiers: modifiersToCreate.map(m => m.optionName)
        });
      }
    }

    await recalculateOrderTotals(order.id);
    stateDelta = { addedItems: addedItemsLog };
  } else if (aiResult.action === 'REMOVE_ITEM' && aiResult.removeItemName) {
    const itemToRemove = order.items.find(i =>
      i.menuItem.name.toLowerCase().includes(aiResult.removeItemName!.toLowerCase())
    );

    if (itemToRemove) {
      await prisma.orderItem.delete({
        where: { id: itemToRemove.id }
      });

      await recalculateOrderTotals(order.id);
      stateDelta = { removedItem: itemToRemove.menuItem.name };
    }
  } else if (aiResult.action === 'MODIFY_ITEM' && aiResult.modificationDetails) {
    const details = aiResult.modificationDetails;
    const itemToModify = order.items.find(i =>
      i.menuItem.name.toLowerCase().includes(details.targetItemName.toLowerCase())
    ) || order.items[order.items.length - 1];

    if (itemToModify) {
      if (details.newQuantity && details.newQuantity > 0) {
        const unitPrice = itemToModify.unitPrice;
        let modDeltaSum = 0;
        itemToModify.modifiers.forEach(m => modDeltaSum += m.priceDelta);

        const newSubtotal = (unitPrice + modDeltaSum) * details.newQuantity;

        await prisma.orderItem.update({
          where: { id: itemToModify.id },
          data: {
            quantity: details.newQuantity,
            subtotal: newSubtotal
          }
        });

        stateDelta = { modifiedItem: itemToModify.menuItem.name, newQuantity: details.newQuantity };
      }

      if (details.newSize) {
        // Fetch item modifier groups
        const menuItem = await prisma.menuItem.findUnique({
          where: { id: itemToModify.menuItemId },
          include: {
            modifierGroups: {
              include: { options: true }
            }
          }
        });

        if (menuItem) {
          for (const group of menuItem.modifierGroups) {
            const sizeOption = group.options.find(
              o => o.name.toLowerCase().includes(details.newSize!.toLowerCase())
            );

            if (sizeOption) {
              // Delete old size modifier if exists
              await prisma.orderItemModifier.deleteMany({
                where: {
                  orderItemId: itemToModify.id,
                  groupId: group.id
                }
              });

              await prisma.orderItemModifier.create({
                data: {
                  orderItemId: itemToModify.id,
                  groupId: group.id,
                  optionId: sizeOption.id,
                  optionName: sizeOption.name,
                  priceDelta: sizeOption.extraPrice
                }
              });

              // Recalculate item subtotal
              let newSubtotal = menuItem.basePrice * itemToModify.quantity;
              const allMods = await prisma.orderItemModifier.findMany({
                where: { orderItemId: itemToModify.id }
              });

              allMods.forEach(m => {
                newSubtotal += m.priceDelta * itemToModify.quantity;
              });

              await prisma.orderItem.update({
                where: { id: itemToModify.id },
                data: { subtotal: newSubtotal }
              });

              stateDelta = { modifiedItem: menuItem.name, newSize: sizeOption.name };
            }
          }
        }
      }

      await recalculateOrderTotals(order.id);
    }
  }

  // Log user utterance & AI event into OrderEventLog
  await prisma.orderEventLog.create({
    data: {
      orderId: order.id,
      speaker: 'USER',
      utterance: utterance,
      actionType: aiResult.action,
      stateDeltaJson: JSON.stringify(stateDelta)
    }
  });

  await prisma.orderEventLog.create({
    data: {
      orderId: order.id,
      speaker: 'AGENT',
      utterance: aiResult.spokenResponse,
      actionType: aiResult.action,
      stateDeltaJson: JSON.stringify({ spoken: true })
    }
  });

  return await getOrCreateActiveOrder();
}

export async function recalculateOrderTotals(orderId: string) {
  const items = await prisma.orderItem.findMany({
    where: { orderId: orderId }
  });

  let subtotal = 0.0;
  items.forEach(i => subtotal += i.subtotal);

  const taxRate = 0.08875; // 8.875% tax
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      subtotal,
      taxAmount,
      totalAmount
    }
  });
}
