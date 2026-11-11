/**
 * 联系人与解锁领域模型
 */
import { z } from 'zod';
import { CompanyIdSchema, IsoDateTimeSchema } from './common.js';

export const ContactTypeSchema = z
  .enum(['mobile', 'phone', 'email', 'other'])
  .meta({ id: 'ContactType', description: '联系方式类型：mobile=手机，phone=固话，email=邮箱' });

export const ContactItemSchema = z
  .object({
    contactId: z.string().optional().meta({ description: '探迹联系人内部 ID（解密后的 _id）' }),
    name: z.string().optional().meta({ description: '联系人姓名（可能脱敏，如“闻*”）' }),
    type: ContactTypeSchema,
    value: z.string().min(1).meta({ description: '手机号/固话/邮箱（解锁后为明文）' }),
    masked: z.boolean().default(false).meta({ description: '是否为掩码（未解锁时 true）' }),
    isKeyLead: z.boolean().optional().meta({ description: '是否关键联系人' }),
    isHighFreq: z.boolean().optional(),
    department: z.string().optional(),
    position: z.string().optional(),
    region: z.string().optional(),
    source: z.string().optional().meta({ description: '来源，如 政务公示平台/年报/官网' }),
    sourceCategory: z.string().optional(),
    tags: z.array(z.string()).default([]),
    followStatus: z.number().int().optional().meta({ description: '跟进状态，0=未跟进' }),
    unlocked: z.boolean().optional(),
    hidden: z.boolean().optional(),
  })
  .meta({ id: 'ContactItem', description: '联系人条目' });

export type ContactItem = z.infer<typeof ContactItemSchema>;

export const ContactCountsSchema = z
  .object({
    mobile: z.number().int().nonnegative().default(0),
    phone: z.number().int().nonnegative().default(0),
    email: z.number().int().nonnegative().default(0),
    total: z.number().int().nonnegative().default(0),
  })
  .meta({ id: 'ContactCounts' });

export const ContactListSchema = z
  .object({
    companyId: CompanyIdSchema,
    companyName: z.string().optional(),
    unlocked: z.boolean().meta({ description: '是否已解锁（未解锁时 contacts 为空）' }),
    counts: ContactCountsSchema,
    contacts: z.array(ContactItemSchema).default([]),
    fetchedAt: IsoDateTimeSchema.optional(),
    cached: z.boolean().default(false),
  })
  .meta({ id: 'ContactList', description: '企业联系人列表' });

export type ContactList = z.infer<typeof ContactListSchema>;

export const UnlockRequestSchema = z
  .object({
    confirm: z.literal(true).meta({ description: '必须显式确认，解锁会消耗 1 个额度点' }),
    idempotencyKey: z.string().min(8).optional().meta({ description: '幂等键，避免重复扣额度' }),
    quota: z.boolean().default(false).meta({ description: '解锁后额外查询一次剩余额度（多 1 次上游调用，默认关闭）' }),
    contacts: z.boolean().default(false).meta({ description: '解锁后立即拉取联系人（多 1 次上游调用，默认关闭）' }),
  })
  .meta({ id: 'UnlockRequest' });

export const UnlockResultSchema = z
  .object({
    companyId: CompanyIdSchema,
    companyName: z.string().optional(),
    alreadyUnlocked: z.boolean().meta({ description: '是否此前已解锁（未额外扣额度）' }),
    unlockedBy: z.string().optional().meta({ description: '解锁人' }),
    unlockedAt: IsoDateTimeSchema.optional(),
    quotaCost: z.number().int().nonnegative().default(0).meta({ description: '本次消耗额度点数' }),
    quotaBefore: z.number().int().nonnegative().optional(),
    quotaAfter: z.number().int().nonnegative().optional(),
    contacts: ContactListSchema.optional().meta({ description: '解锁后返回的联系人（可选）' }),
  })
  .meta({ id: 'UnlockResult', description: '解锁结果' });

export type UnlockResult = z.infer<typeof UnlockResultSchema>;

export type UnlockRequest = z.infer<typeof UnlockRequestSchema>;
