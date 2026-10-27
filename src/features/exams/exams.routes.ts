import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middlewares/authenticate';
import { requireSchool } from '../../middlewares/requireSchool';
import { requireStaff } from '../../middlewares/requireStaff';
import { requirePermission } from '../../middlewares/requirePermission';
import { sendSuccess } from '../../lib/http';
import { getExamEditor, getPublishedExams, saveExamTimetable, publishExamTimetable } from './exams.service';

const routes = Router();
routes.use(authenticate, requireSchool);
routes.get('/published', requirePermission('exams:read'), async (req, res, next) => { try { sendSuccess(res, await getPublishedExams(req.auth!, req.query)); } catch (error) { next(error); } });
routes.use(requireStaff);
routes.get('/editor', requirePermission('exams:write'), async (req, res, next) => { try { sendSuccess(res, await getExamEditor(req.auth!.schoolId!, z.string().uuid().parse(req.query.termId))); } catch (error) { next(error); } });
routes.put('/timetable', requirePermission('exams:write'), async (req, res, next) => { try { sendSuccess(res, await saveExamTimetable(req.auth!.schoolId!, req.auth!.userId, req.body)); } catch (error) { next(error); } });
for (const [path, withdraw] of [['publish', false], ['unpublish', true]] as const) routes.post('/timetable/' + path, requirePermission('exams:publish'), async (req, res, next) => { try { sendSuccess(res, await publishExamTimetable(req.auth!.schoolId!, req.auth!.userId, req.body, withdraw)); } catch (error) { next(error); } });
export default routes;
