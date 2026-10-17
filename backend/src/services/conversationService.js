import * as conversationModel from '../models/conversationModel.js';
import * as messageModel from '../models/messageModel.js';
import { AppError } from '../utils/AppError.js';

export const listConversations = (userId, opts) => conversationModel.list(userId, opts);

export const createConversation = (userId, title) => conversationModel.create(userId, title || undefined);

export async function requireConversation(userId, id) {
  const conversation = await conversationModel.findById(userId, id);
  if (!conversation) throw AppError.notFound('Conversation');
  return conversation;
}

export async function getConversation(userId, id) {
  const conversation = await requireConversation(userId, id);
  const messages = await messageModel.listForConversation(id);
  return { conversation, messages };
}

export async function renameConversation(userId, id, title) {
  const conversation = await conversationModel.rename(userId, id, title);
  if (!conversation) throw AppError.notFound('Conversation');
  return conversation;
}

export async function deleteConversation(userId, id) {
  if (!(await conversationModel.remove(userId, id))) throw AppError.notFound('Conversation');
}
