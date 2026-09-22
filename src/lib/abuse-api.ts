import {errorResponse} from './api';
import {recordRejection} from './abuse';
export async function abuseError(error:unknown){
  await recordRejection(error).catch(()=>{});
  const response=errorResponse(error);
  if(response.status===429)response.headers.set('Retry-After','60');
  return response;
}
