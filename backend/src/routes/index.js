import { Router } from 'express';
import authRoutes from './authRoutes.js';
import documentRoutes from './documentRoutes.js';
import noteRoutes from './noteRoutes.js';
import conversationRoutes from './conversationRoutes.js';
import { authenticateUser } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { uuidParam } from '../validators/common.js';
import { chatSchema, searchSchema } from '../validators/chatValidators.js';
import { chat } from '../controllers/chatController.js';
import * as knowledge from '../controllers/knowledgeController.js';

const router = Router();

router.use('/auth', authRoutes);

// Everything below requires a valid session.
router.use(authenticateUser);
router.use('/documents', documentRoutes);
router.use('/notes', noteRoutes);
router.use('/conversations', conversationRoutes);
router.post('/chat', aiLimiter, validate({ body: chatSchema }), chat);
router.post('/search', validate({ body: searchSchema }), knowledge.search);
router.get('/stats', knowledge.stats);
router.get('/graph', knowledge.graph);
router.get('/chunks/:id', validate({ params: uuidParam }), knowledge.chunk);

export default router;
