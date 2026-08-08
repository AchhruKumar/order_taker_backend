import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding restaurant database...');

  // Clean existing data
  await prisma.orderItemModifier.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.orderEventLog.deleteMany();
  await prisma.order.deleteMany();
  await prisma.modifierOption.deleteMany();
  await prisma.modifierGroup.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.category.deleteMany();

  // Create Categories
  const burgersCat = await prisma.category.create({
    data: { name: 'Gourmet Burgers', icon: 'Beef', displayOrder: 1 }
  });

  const pizzasCat = await prisma.category.create({
    data: { name: 'Artisanal Pizzas', icon: 'Pizza', displayOrder: 2 }
  });

  const sidesCat = await prisma.category.create({
    data: { name: 'Sides & Starters', icon: 'Fries', displayOrder: 3 }
  });

  const drinksCat = await prisma.category.create({
    data: { name: 'Beverages', icon: 'CupSoda', displayOrder: 4 }
  });

  const dessertsCat = await prisma.category.create({
    data: { name: 'Desserts', icon: 'IceCream', displayOrder: 5 }
  });

  // 1. Classic Smash Cheeseburger
  await prisma.menuItem.create({
    data: {
      categoryId: burgersCat.id,
      name: 'Smash Cheeseburger',
      description: 'Double smashed Angus beef patty, American cheese, house pickle sauce, toasted brioche bun.',
      basePrice: 12.99,
      isAvailable: true,
      modifierGroups: {
        create: [
          {
            name: 'Cheese Options',
            minSelect: 1,
            maxSelect: 1,
            required: false,
            options: {
              create: [
                { name: 'American Cheese', extraPrice: 0.00 },
                { name: 'Extra Cheddar', extraPrice: 1.50 },
                { name: 'Swiss Cheese', extraPrice: 1.50 },
                { name: 'No Cheese', extraPrice: 0.00 }
              ]
            }
          },
          {
            name: 'Extra Toppings',
            minSelect: 0,
            maxSelect: 3,
            required: false,
            options: {
              create: [
                { name: 'Crispy Bacon', extraPrice: 2.00 },
                { name: 'Caramelized Onions', extraPrice: 1.00 },
                { name: 'Avocado', extraPrice: 2.50 },
                { name: 'Extra Pickles', extraPrice: 0.50 }
              ]
            }
          }
        ]
      }
    }
  });

  // 2. Spicy Truffle Mushroom Burger
  await prisma.menuItem.create({
    data: {
      categoryId: burgersCat.id,
      name: 'Truffle Mushroom Burger',
      description: 'Single Angus patty, wild sauteed mushrooms, truffle aioli, Swiss cheese, arugula.',
      basePrice: 14.50,
      isAvailable: true,
      modifierGroups: {
        create: [
          {
            name: 'Patty Count',
            minSelect: 1,
            maxSelect: 1,
            required: true,
            options: {
              create: [
                { name: 'Single Patty', extraPrice: 0.00 },
                { name: 'Double Patty', extraPrice: 3.50 }
              ]
            }
          }
        ]
      }
    }
  });

  // 3. Pepperoni Pizza
  await prisma.menuItem.create({
    data: {
      categoryId: pizzasCat.id,
      name: 'Pepperoni Pizza',
      description: 'Neapolitan sourdough crust, San Marzano tomato sauce, fresh mozzarella, crispy pepperoni.',
      basePrice: 16.99,
      isAvailable: true,
      modifierGroups: {
        create: [
          {
            name: 'Pizza Size',
            minSelect: 1,
            maxSelect: 1,
            required: true,
            options: {
              create: [
                { name: 'Medium (12")', extraPrice: 0.00 },
                { name: 'Large (16")', extraPrice: 4.00 }
              ]
            }
          },
          {
            name: 'Crust Type',
            minSelect: 1,
            maxSelect: 1,
            required: false,
            options: {
              create: [
                { name: 'Thin Sourdough', extraPrice: 0.00 },
                { name: 'Stuffed Crust', extraPrice: 3.00 },
                { name: 'Gluten Free Crust', extraPrice: 3.50 }
              ]
            }
          }
        ]
      }
    }
  });

  // 4. French Fries
  await prisma.menuItem.create({
    data: {
      categoryId: sidesCat.id,
      name: 'Crispy French Fries',
      description: 'Hand-cut golden potatoes seasoned with sea salt.',
      basePrice: 4.99,
      isAvailable: true,
      modifierGroups: {
        create: [
          {
            name: 'Fries Size',
            minSelect: 1,
            maxSelect: 1,
            required: true,
            options: {
              create: [
                { name: 'Regular', extraPrice: 0.00 },
                { name: 'Large', extraPrice: 2.00 }
              ]
            }
          },
          {
            name: 'Dipping Sauce',
            minSelect: 0,
            maxSelect: 2,
            required: false,
            options: {
              create: [
                { name: 'Truffle Mayo', extraPrice: 1.00 },
                { name: 'House Ketchup', extraPrice: 0.00 },
                { name: 'Spicy Ranch', extraPrice: 0.75 }
              ]
            }
          }
        ]
      }
    }
  });

  // 5. Fountain Soda / Drink
  await prisma.menuItem.create({
    data: {
      categoryId: drinksCat.id,
      name: 'Fountain Soda',
      description: 'Refreshing cold drink (Coca-Cola, Diet Coke, Sprite, Lemonade).',
      basePrice: 2.99,
      isAvailable: true,
      modifierGroups: {
        create: [
          {
            name: 'Flavor Choice',
            minSelect: 1,
            maxSelect: 1,
            required: true,
            options: {
              create: [
                { name: 'Coca-Cola', extraPrice: 0.00 },
                { name: 'Diet Coke', extraPrice: 0.00 },
                { name: 'Sprite', extraPrice: 0.00 },
                { name: 'Fresh Lemonade', extraPrice: 0.50 }
              ]
            }
          },
          {
            name: 'Ice Level',
            minSelect: 1,
            maxSelect: 1,
            required: false,
            options: {
              create: [
                { name: 'Regular Ice', extraPrice: 0.00 },
                { name: 'Light Ice', extraPrice: 0.00 },
                { name: 'No Ice', extraPrice: 0.00 }
              ]
            }
          }
        ]
      }
    }
  });

  // 6. Milkshake
  await prisma.menuItem.create({
    data: {
      categoryId: dessertsCat.id,
      name: 'Handcrafted Milkshake',
      description: 'Rich hand-spun ice cream shake topped with whipped cream.',
      basePrice: 5.99,
      isAvailable: true,
      modifierGroups: {
        create: [
          {
            name: 'Milkshake Flavor',
            minSelect: 1,
            maxSelect: 1,
            required: true,
            options: {
              create: [
                { name: 'Vanilla Bean', extraPrice: 0.00 },
                { name: 'Double Chocolate', extraPrice: 0.00 },
                { name: 'Salted Caramel', extraPrice: 0.50 },
                { name: 'Cookies & Cream', extraPrice: 0.75 }
              ]
            }
          }
        ]
      }
    }
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
