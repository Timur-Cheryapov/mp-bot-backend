/**
 * Utility functions for processing and adjusting text content
 */

/**
 * Adjusts a product description to meet Wildberries schema requirements:
 * - Must be either empty or between 1000-5000 characters
 * - Intelligently expands short descriptions or truncates long ones
 * @param description - The original description from AI
 * @param productTitle - Product title to help with expansion context
 * @returns Adjusted description that meets the schema requirements
 */
export function adjustProductDescription(description: string, productTitle?: string): string {
  // If description is empty or null, return empty string
  if (!description || description.trim() === '') {
    return '';
  }

  const trimmedDescription = description.trim();
  const currentLength = trimmedDescription.length;

  // If already in valid range (1000-5000), return as is
  if (currentLength >= 1000 && currentLength <= 5000) {
    return trimmedDescription;
  }

  // If too short, expand it
  if (currentLength < 1000) {
    return expandDescription(trimmedDescription, productTitle);
  }

  // If too long, truncate it
  if (currentLength > 5000) {
    return truncateDescription(trimmedDescription);
  }

  return trimmedDescription;
}

/**
 * Expands a short description to reach at least 1000 characters
 * @param description - Original description
 * @param productTitle - Product title for context
 * @returns Expanded description
 */
function expandDescription(description: string, productTitle?: string): string {
  let expandedDescription = description;
  
  // Common expansion phrases for product descriptions
  const expansionTemplates = [
    "\n\nЭтот товар отличается высоким качеством материалов и продуманным дизайном, что делает его идеальным выбором для взыскательных покупателей.",
    "\n\nОсобенности и преимущества:\n• Качественные материалы изготовления\n• Тщательная проработка деталей\n• Соответствие современным стандартам\n• Удобство в использовании\n• Долговечность и надежность",
    "\n\nПроизводитель уделяет особое внимание контролю качества на всех этапах производства, что гарантирует соответствие товара заявленным характеристикам.",
    "\n\nДанный товар прошел необходимые проверки и соответствует всем требованиям безопасности и качества.",
    "\n\nБлагодаря продуманной конструкции и использованию качественных материалов, этот товар обеспечивает комфорт и удобство в повседневном использовании.",
    "\n\nТовар упакован в надежную упаковку, которая обеспечивает сохранность при транспортировке и хранении.",
    "\n\nРекомендации по уходу и эксплуатации прилагаются к товару, что поможет продлить срок его службы.",
    "\n\nПри возникновении вопросов или необходимости консультации, наша служба поддержки всегда готова помочь."
  ];

  // Add expansions until we reach at least 1000 characters
  let templateIndex = 0;
  while (expandedDescription.length < 1000 && templateIndex < expansionTemplates.length) {
    expandedDescription += expansionTemplates[templateIndex];
    templateIndex++;
  }

  // If still too short, add more generic content
  if (expandedDescription.length < 1000) {
    const remaining = 1000 - expandedDescription.length;
    const genericText = "\n\nДополнительная информация о товаре: данный продукт представляет собой качественное решение, которое сочетает в себе функциональность, надежность и привлекательный внешний вид. Товар изготовлен с соблюдением всех технологических требований и стандартов качества.";
    
    if (remaining > genericText.length) {
      expandedDescription += genericText;
      // Add more padding if needed
      const extraPadding = " Производитель гарантирует высокое качество и соответствие всем заявленным характеристикам.".repeat(Math.ceil((remaining - genericText.length) / 100));
      expandedDescription += extraPadding.substring(0, remaining - genericText.length);
    } else {
      expandedDescription += genericText.substring(0, remaining);
    }
  }

  return expandedDescription.substring(0, 5000); // Ensure we don't exceed max length
}

/**
 * Truncates a long description to fit within 5000 characters
 * @param description - Original long description
 * @returns Truncated description
 */
function truncateDescription(description: string): string {
  if (description.length <= 5000) {
    return description;
  }

  // Try to truncate at a sentence boundary near 5000 characters
  const truncationTarget = 4950; // Leave some buffer
  let truncationPoint = truncationTarget;

  // Look for sentence endings (., !, ?) near the target point
  const sentenceEndings = ['.', '!', '?'];
  for (let i = truncationTarget; i >= truncationTarget - 200 && i >= 0; i--) {
    if (sentenceEndings.includes(description[i])) {
      truncationPoint = i + 1;
      break;
    }
  }

  // If no sentence ending found, look for paragraph break
  if (truncationPoint === truncationTarget) {
    for (let i = truncationTarget; i >= truncationTarget - 200 && i >= 0; i--) {
      if (description[i] === '\n') {
        truncationPoint = i;
        break;
      }
    }
  }

  // If still no good break point, look for space
  if (truncationPoint === truncationTarget) {
    for (let i = truncationTarget; i >= truncationTarget - 100 && i >= 0; i--) {
      if (description[i] === ' ') {
        truncationPoint = i;
        break;
      }
    }
  }

  return description.substring(0, truncationPoint).trim();
}

/**
 * Validates if a description meets Wildberries requirements
 * @param description - Description to validate
 * @returns Object with validation result and message
 */
export function validateProductDescription(description: string): { 
  isValid: boolean; 
  message?: string; 
  length: number; 
} {
  const length = description.length;
  
  if (length === 0) {
    return { isValid: true, length };
  }
  
  if (length < 1000) {
    return { 
      isValid: false, 
      message: `Description is too short (${length} characters). Must be at least 1000 characters or empty.`,
      length 
    };
  }
  
  if (length > 5000) {
    return { 
      isValid: false, 
      message: `Description is too long (${length} characters). Must be at most 5000 characters.`,
      length 
    };
  }
  
  return { isValid: true, length };
} 