import { Router } from 'express';
import * as conversations from '../controllers/conversationController.js';
import { validate } from '../middleware/validate.js';
import { uuidParam } from '../validators/common.js';
import {
  createConversationSchema,
  renameConversationSchema,
  listConversationsQuery,
} from '../validators/chatValidators.js';

const router = Router();

router.get('/', validate({ query: listConversationsQuery }), conversations.list);
router.post('/', validate({ body: createConversationSchema }), conversations.create);
router.get('/:id', validate({ params: uuidParam }), conversations.get);
router.patch('/:id', validate({ params: uuidParam, body: renameConversationSchema }), conversations.rename);
router.delete('/:id', validate({ params: uuidParam }), conversations.remove);

export default router;
