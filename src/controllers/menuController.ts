import { Request, Response } from 'express';
import { prisma } from '../services/dbClient.js';

export async function getMenu(req: Request, res: Response) {
  try {
    let categories = await prisma.category.findMany({
      orderBy: { displayOrder: 'asc' },
      include: {
        items: {
          include: {
            modifierGroups: {
              include: {
                options: true
              }
            }
          }
        }
      }
    });

    if (categories.length === 0) {
      const defaultCats = [
        { name: 'Gourmet Burgers', icon: 'Beef', displayOrder: 1 },
        { name: 'Artisanal Pizzas', icon: 'Pizza', displayOrder: 2 },
        { name: 'Sides & Starters', icon: 'Fries', displayOrder: 3 },
        { name: 'Beverages', icon: 'CupSoda', displayOrder: 4 },
        { name: 'Desserts', icon: 'IceCream', displayOrder: 5 }
      ];
      for (const cat of defaultCats) {
        await prisma.category.create({ data: cat });
      }
      categories = await prisma.category.findMany({
        orderBy: { displayOrder: 'asc' },
        include: {
          items: {
            include: {
              modifierGroups: {
                include: {
                  options: true
                }
              }
            }
          }
        }
      });
    }

    res.json({ categories });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function createMenuItem(req: Request, res: Response) {
  try {
    const { categoryId, name, description, basePrice, isAvailable, imageUrl } = req.body;

    if (!name || typeof basePrice !== 'number' || !categoryId) {
      return res.status(400).json({ error: 'Name, categoryId, and numeric basePrice are required' });
    }

    let targetCategoryId = categoryId;
    const existingCat = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!existingCat) {
      const firstCat = await prisma.category.findFirst();
      if (firstCat) {
        targetCategoryId = firstCat.id;
      } else {
        const newCat = await prisma.category.create({
          data: { name: 'Gourmet Burgers', displayOrder: 1 }
        });
        targetCategoryId = newCat.id;
      }
    }

    const item = await prisma.menuItem.create({
      data: {
        categoryId: targetCategoryId,
        name,
        description: description || '',
        basePrice,
        isAvailable: isAvailable !== undefined ? isAvailable : true,
        imageUrl: imageUrl || null
      },
      include: {
        modifierGroups: {
          include: { options: true }
        }
      }
    });

    res.json({ success: true, item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function updateMenuItem(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { categoryId, name, description, basePrice, isAvailable, imageUrl } = req.body;

    if (!id) return res.status(400).json({ error: 'Item ID is required' });

    const item = await prisma.menuItem.update({
      where: { id },
      data: {
        ...(categoryId && { categoryId }),
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(typeof basePrice === 'number' && { basePrice }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(imageUrl !== undefined && { imageUrl })
      },
      include: {
        modifierGroups: {
          include: { options: true }
        }
      }
    });

    res.json({ success: true, item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function deleteMenuItem(req: Request, res: Response) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Item ID is required' });

    await prisma.modifierOption.deleteMany({
      where: { group: { menuItemId: id } }
    });
    await prisma.modifierGroup.deleteMany({
      where: { menuItemId: id }
    });
    await prisma.menuItem.delete({
      where: { id }
    });

    res.json({ success: true, message: `Menu item ${id} deleted` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
