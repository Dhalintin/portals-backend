import type {GoogleProfile} from '../../lib/goggle';
/** Only verified Google data fills missing fields; user edits always win. */
export function missingGoogleDetails(user:{firstName:string;lastName:string;avatarUrl?:string|null},profile:GoogleProfile){return {...(!user.firstName?.trim()&&profile.firstName?{firstName:profile.firstName}:{}),...(!user.lastName?.trim()&&profile.lastName?{lastName:profile.lastName}:{}),...(!user.avatarUrl?.trim()&&profile.avatarUrl?{avatarUrl:profile.avatarUrl}:{})};}
