
import { GoogleGenAI, Type } from "@google/genai";
import { Member, Account, Interaction } from '../types';

const isQuotaError = (error: any) => {
  return error.status === 429 || 
         (error.message && error.message.includes('429')) || 
         (error.toString().includes('RESOURCE_EXHAUSTED'));
};

const handleGeminiError = (error: any, fallbackMessage: string) => {
  if (isQuotaError(error)) {
    console.warn("Gemini AI: Quota Exceeded. Feature temporarily unavailable.");
    return `${fallbackMessage} (Service Busy)`;
  }
  console.error("Gemini API Error:", error);
  return fallbackMessage;
};

// Fix: Updated to use gemini-3-flash-preview for basic text summarization
export const generateMemberSummary = async (member: Member, accounts: Account[], interactions: Interaction[]): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  if (!process.env.API_KEY) return "AI Configuration Missing (API Key).";
  try {
    const prompt = `
      You are a banking assistant for a Co-operative Society.
      Analyze the following member data and provide a concise 3-sentence summary highlighting their financial standing, recent activity, and any potential churn risk or upselling opportunities.

      Member: ${member.fullName} (Join Date: ${member.joinDate})
      Accounts: ${JSON.stringify(accounts.map(a => ({ type: a.type, balance: a.balance, status: a.status })))}
      Recent Interactions: ${JSON.stringify(interactions.slice(0, 3).map(i => ({ date: i.date, notes: i.notes })))}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Unable to generate summary.";
  } catch (error) {
    return handleGeminiError(error, "AI Summary unavailable.");
  }
};

// Fix: Updated to use gemini-3-pro-preview for complex reasoning and added responseSchema for structured JSON
export const analyzeFinancialHealth = async (accounts: Account[]): Promise<{ score: number; assessment: string; recommendations: string[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  if (!process.env.API_KEY) return { score: 0, assessment: "System not configured.", recommendations: [] };
  try {
    const prompt = `
      Analyze the financial health of a member based on these accounts. 
      Return valid JSON with:
      - score (0-100 integer)
      - assessment (string, 1-2 sentences)
      - recommendations (array of strings, specific financial advice)

      Data: ${JSON.stringify(accounts.map(a => ({ type: a.type, balance: a.balance, status: a.status, transactions: a.transactions.length })))}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER, description: 'Financial health score from 0 to 100' },
            assessment: { type: Type.STRING, description: 'Summary assessment of health' },
            recommendations: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: 'List of actionable financial advice'
            }
          },
          required: ['score', 'assessment', 'recommendations']
        }
      }
    });
    
    const text = response.text;
    if (!text) throw new Error("No response text");
    return JSON.parse(text);
  } catch (error) {
    if (isQuotaError(error)) {
        console.warn("Gemini Health Check: Quota Exceeded");
        return {
          score: -1,
          assessment: "Financial analysis unavailable due to high system load. Please try again later.",
          recommendations: ["Perform manual review of account statements."]
        };
    }
    console.error("Gemini Health Check Error", error);
    return {
      score: -1,
      assessment: "Financial analysis unavailable.",
      recommendations: ["Perform manual review."]
    };
  }
};

// Fix: Updated to use gemini-3-flash-preview for professional note drafting
export const draftInteractionNote = async (type: string, keyPoints: string): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    if (!process.env.API_KEY) return keyPoints;
    try {
        const prompt = `Draft a professional and concise CRM interaction note for a ${type}. Key points included: ${keyPoints}. Keep it objective and strictly factual.`;
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });
        return response.text || "";
    } catch (e) {
        return keyPoints;
    }
}

// Fix: Updated to use gemini-3-pro-preview for risk analysis and added responseSchema for structured JSON
export const calculateMemberRisk = async (member: Member, accounts: Account[]): Promise<{ score: number; reason: string }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  if (!process.env.API_KEY) return { score: 0, reason: "AI Not Configured" };
  try {
    const prompt = `
      Analyze the risk profile of this cooperative society member.
      Return valid JSON with:
      - score (0-100 integer, where 100 is HIGH risk, 0 is LOW risk)
      - reason (string, concise explanation of the risk factors)

      Member: ${member.fullName}, Status: ${member.status}, Tenure: since ${member.joinDate}
      Accounts Overview: ${JSON.stringify(accounts.map(a => ({ 
        type: a.type, 
        balance: a.balance, 
        status: a.status,
        loanType: a.loanType,
        transactionsCount: a.transactions.length
      })))}
      
      Risk factors to consider:
      - Defaulted loans or dormant accounts increase risk.
      - High loan balances without corresponding savings increase risk.
      - Regular activity and savings decrease risk.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { 
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER, description: 'Risk score from 0 (low) to 100 (high)' },
            reason: { type: Type.STRING, description: 'Explanation of identified risk factors' }
          },
          required: ['score', 'reason']
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response text");
    return JSON.parse(text);
  } catch (error) {
    if (isQuotaError(error)) {
        console.warn("Gemini Risk Calc: Quota Exceeded");
        return { score: -1, reason: "Risk analysis service temporarily unavailable." };
    }
    console.error("Gemini Risk Calc Error", error);
    return {
      score: -1,
      reason: "Automated risk analysis unavailable."
    };
  }
};
