import { Router } from 'express';
import * as notes from '../controllers/noteController.js';
import { validate } from '../middleware/validate.js';
import { uuidParam } from '../validators/common.js';
import { createNoteSchema, updateNoteSchema, listNotesQuery } from '../validators/noteValidators.js';

const router = Router();

router.get('/', validate({ query: listNotesQuery }), notes.list);
router.get('/tags', notes.tags);
router.post('/', validate({ body: createNoteSchema }), notes.create);
router.get('/:id', validate({ params: uuidParam }), notes.get);
router.put('/:id', validate({ params: uuidParam, body: updateNoteSchema }), notes.update);
router.delete('/:id', validate({ params: uuidParam }), notes.remove);

export default router;
