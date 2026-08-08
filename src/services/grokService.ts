import dotenv from 'dotenv';
dotenv.config();

// ─── Live Quota Tracking (from Groq response headers) ───────────────────────
export interface GroqQuotaInfo {
  limitRequestsPerDay: number | null;
  remainingRequests: number | null;
  limitTokensPerDay: number | null;
  remainingTokens: number | null;
  resetRequestsAt: string | null;
  resetTokensAt: string | null;
  lastUpdated: string | null;
}

let _quotaInfo: GroqQuotaInfo = {
  limitRequestsPerDay: null,
  remainingRequests: null,
  limitTokensPerDay: null,
  remainingTokens: null,
  resetRequestsAt: null,
  resetTokensAt: null,
  lastUpdated: null
};

export function getGroqQuotaInfo(): GroqQuotaInfo {
  return _quotaInfo;
}

function captureQuotaHeaders(headers: Headers) {
  const toNum = (v: string | null) => v ? parseInt(v, 10) : null;
  _quotaInfo = {
    limitRequestsPerDay: toNum(headers.get('x-ratelimit-limit-requests')),
    remainingRequests: toNum(headers.get('x-ratelimit-remaining-requests')),
    limitTokensPerDay: toNum(headers.get('x-ratelimit-limit-tokens')),
    remainingTokens: toNum(headers.get('x-ratelimit-remaining-tokens')),
    resetRequestsAt: headers.get('x-ratelimit-reset-requests'),
    resetTokensAt: headers.get('x-ratelimit-reset-tokens'),
    lastUpdated: new Date().toISOString()
  };
}

export interface AIOrderResponse {
  action: 'ADD_ITEM' | 'MODIFY_ITEM' | 'REMOVE_ITEM' | 'INQUIRE_MENU' | 'RESET_ORDER' | 'CONFIRM_ORDER' | 'UNKNOWN';
  spokenResponse: string;
  items?: Array<{
    itemName: string;
    quantity: number;
    size?: string;
    modifiers?: string[];
    specialInstructions?: string;
  }>;
  modificationDetails?: {
    targetItemName: string;
    action: 'CHANGE_SIZE' | 'ADD_MODIFIER' | 'REMOVE_MODIFIER' | 'CHANGE_QUANTITY';
    newSize?: string;
    addedModifiers?: string[];
    removedModifiers?: string[];
    newQuantity?: number;
  };
  removeItemName?: string;
}

export async function processVoiceUtteranceWithGrok(
  utterance: string,
  currentOrderContext: any,
  menuCatalogContext: any,
  userApiKey?: string
): Promise<AIOrderResponse> {
  const groqKey = userApiKey || process.env.GROQ_API_KEY;

  const systemPrompt = `You are an AI Voice Order-Taker for a high-end restaurant.
Your task is to analyze customer voice input and return a structured JSON response.

Current Restaurant Menu:
${JSON.stringify(menuCatalogContext, null, 2)}

Current Order Cart State:
${JSON.stringify(currentOrderContext, null, 2)}

Return strictly valid JSON with this shape:
{
  "action": "ADD_ITEM" | "MODIFY_ITEM" | "REMOVE_ITEM" | "INQUIRE_MENU" | "RESET_ORDER" | "CONFIRM_ORDER" | "UNKNOWN",
  "spokenResponse": "Concise natural voice response to speak back to customer (keep under 25 words)",
  "items": [
    {
      "itemName": "Matched Menu Item Name",
      "quantity": 1,
      "size": "Medium / Large",
      "modifiers": ["Extra Cheddar", "Crispy Bacon"],
      "specialInstructions": "extra crispy"
    }
  ],
  "modificationDetails": {
    "targetItemName": "Item to modify in cart",
    "action": "CHANGE_SIZE" | "ADD_MODIFIER" | "REMOVE_MODIFIER" | "CHANGE_QUANTITY",
    "newSize": "Large",
    "addedModifiers": ["Extra Pickles"],
    "removedModifiers": ["American Cheese"],
    "newQuantity": 2
  },
  "removeItemName": "Item to remove from cart"
}`;

  // Try Groq Cloud API (llama-3.3-70b-versatile — very high free quota)
  if (groqKey && groqKey.trim().length > 0) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: utterance }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      });

      if (response.ok) {
        captureQuotaHeaders(response.headers);
        const data = await response.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        console.log('✅ Groq Cloud response:', parsed.action, parsed.spokenResponse);
        return parsed as AIOrderResponse;
      } else if (response.status === 429) {
        captureQuotaHeaders(response.headers);
        // Rate limit hit — return special flag so frontend can alert user
        console.warn('⚠️ Groq API rate limit exceeded (429). Notify user to update key.')
        return {
          action: 'UNKNOWN',
          spokenResponse: 'Your Groq API key limit has been exceeded. Please update your API key in Settings.',
          __rateLimited: true
        } as any;
      } else {
        const errText = await response.text();
        console.warn(`Groq Cloud API error (Status ${response.status}):`, errText);
      }
    } catch (err) {
      console.warn('Groq API call failed, falling back to local NLP engine:', err);
    }
  }

  // Fallback Rule-Based Intelligent NLP Engine
  return fallbackNLPProcessor(utterance, currentOrderContext, menuCatalogContext);
}

function fallbackNLPProcessor(
  text: string,
  cart: any,
  menu: any[]
): AIOrderResponse {
  const lower = text.toLowerCase();

  // Reset check
  if (lower.includes('start over') || lower.includes('reset order') || lower.includes('clear cart')) {
    return {
      action: 'RESET_ORDER',
      spokenResponse: 'I have cleared your order. What can I get started for you today?'
    };
  }

  // Confirmation check
  if (lower.includes('that is all') || lower.includes("that's all") || lower.includes('confirm order') || lower.includes('place order') || lower.includes('complete order')) {
    return {
      action: 'CONFIRM_ORDER',
      spokenResponse: 'Great! Your order is confirmed and sent to the kitchen. Thank you!'
    };
  }

  // Mid-order Remove check
  if (lower.includes('remove') || lower.includes('cancel') || lower.includes('take off') || lower.includes('delete')) {
    let matchedItem = '';
    if (cart?.items) {
      for (const cartItem of cart.items) {
        if (lower.includes(cartItem.menuItem.name.toLowerCase()) || lower.includes('coke') || lower.includes('burger') || lower.includes('pizza') || lower.includes('fries')) {
          matchedItem = cartItem.menuItem.name;
          break;
        }
      }
    }

    if (!matchedItem && cart?.items?.length > 0) {
      matchedItem = cart.items[cart.items.length - 1].menuItem.name;
    }

    if (matchedItem) {
      return {
        action: 'REMOVE_ITEM',
        spokenResponse: `Got it. I've removed the ${matchedItem} from your order.`,
        removeItemName: matchedItem
      };
    }
  }

  // Mid-order Modification check
  if (lower.includes('change') || lower.includes('instead') || lower.includes('make that') || lower.includes('no pickles') || lower.includes('extra') || lower.includes('large') || lower.includes('medium')) {
    // Check size change
    let newSize = '';
    if (lower.includes('large') || lower.includes('16"')) newSize = lower.includes('16"') ? 'Large (16")' : 'Large';
    if (lower.includes('medium') || lower.includes('12"')) newSize = lower.includes('12"') ? 'Medium (12")' : 'Medium';
    if (lower.includes('regular')) newSize = 'Regular';

    let addedMods: string[] = [];
    let removedMods: string[] = [];
    if (lower.includes('extra cheddar') || lower.includes('cheddar')) addedMods.push('Extra Cheddar');
    if (lower.includes('bacon')) addedMods.push('Crispy Bacon');
    if (lower.includes('truffle mayo')) addedMods.push('Truffle Mayo');
    if (lower.includes('no cheese')) addedMods.push('No Cheese');

    let targetItem = cart?.items?.[0]?.menuItem?.name || 'Smash Cheeseburger';

    if (lower.includes('fries')) targetItem = 'Crispy French Fries';
    if (lower.includes('pizza') || lower.includes('pepperoni')) targetItem = 'Pepperoni Pizza';
    if (lower.includes('burger') || lower.includes('cheeseburger')) targetItem = 'Smash Cheeseburger';
    if (lower.includes('drink') || lower.includes('soda') || lower.includes('coke')) targetItem = 'Fountain Soda';

    return {
      action: 'MODIFY_ITEM',
      spokenResponse: `Updated your ${targetItem}. ${newSize ? `Size changed to ${newSize}.` : ''} Anything else?`,
      modificationDetails: {
        targetItemName: targetItem,
        action: newSize ? 'CHANGE_SIZE' : 'ADD_MODIFIER',
        newSize: newSize || undefined,
        addedModifiers: addedMods.length > 0 ? addedMods : undefined
      }
    };
  }

  // Menu Inquiry
  if (lower.includes('what do you have') || lower.includes('menu') || lower.includes('options') || lower.includes('recommend')) {
    return {
      action: 'INQUIRE_MENU',
      spokenResponse: 'We offer Smash Cheeseburgers, Truffle Mushroom Burgers, Pepperoni Pizza, Crispy French Fries, Drinks, and Milkshakes!'
    };
  }

  // Dynamic Menu Item Match against database catalog (supports newly added dishes!)
  if (Array.isArray(menu)) {
    for (const category of menu) {
      if (Array.isArray(category.items)) {
        for (const item of category.items) {
          const itemNameLower = item.name.toLowerCase();
          const words = itemNameLower.split(/\s+/).filter((w: string) => w.length > 3 && !['with', 'and', 'from', 'order', 'please', 'make', 'extra'].includes(w));
          
          const isDirectMatch = lower.includes(itemNameLower);
          const isKeywordMatch = words.length > 0 && words.some((w: string) => lower.includes(w));

          if (isDirectMatch || isKeywordMatch) {
            // Avoid duplicate additions
            if (!itemsToAdd.some(i => i.itemName === item.name)) {
              const qty = extractQuantity(lower, itemNameLower) || 1;
              const mods: string[] = [];

              if (Array.isArray(item.modifierGroups)) {
                for (const group of item.modifierGroups) {
                  if (Array.isArray(group.options)) {
                    for (const opt of group.options) {
                      if (lower.includes(opt.name.toLowerCase())) {
                        mods.push(opt.name);
                      }
                    }
                  }
                }
              }

              itemsToAdd.push({
                itemName: item.name,
                quantity: qty,
                modifiers: mods
              });
            }
          }
        }
      }
    }
  }

  if (itemsToAdd.length > 0) {
    const itemNames = itemsToAdd.map(i => `${i.quantity} ${i.itemName}`).join(' and ');
    return {
      action: 'ADD_ITEM',
      spokenResponse: `Added ${itemNames} to your order. What else would you like?`,
      items: itemsToAdd
    };
  }

  return {
    action: 'UNKNOWN',
    spokenResponse: "I didn't quite catch that. Could you repeat your order?"
  };
}

function extractQuantity(text: string, itemKeyword: string): number {
  if (text.includes('two ') || text.includes('2 ')) return 2;
  if (text.includes('three ') || text.includes('3 ')) return 3;
  if (text.includes('four ') || text.includes('4 ')) return 4;
  return 1;
}
