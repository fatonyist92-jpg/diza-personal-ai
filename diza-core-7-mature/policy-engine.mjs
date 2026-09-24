export class MaturePolicyError extends Error{
  constructor(code,message){
    super(message);
    this.name="MaturePolicyError";
    this.code=code;
  }
}

export function validateMatureRequest(request={}){
  const {
    capability,
    allAdultsConfirmed=false,
    ageAmbiguous=false,
    subjectType="synthetic",
    consentConfirmed=false,
    coercedOrNonConsensual=false,
  }=request;

  if(!capability)throw new MaturePolicyError("CAPABILITY_REQUIRED","Mature capability is required");
  if(ageAmbiguous||!allAdultsConfirmed){
    throw new MaturePolicyError("ADULT_STATUS_REQUIRED","All depicted subjects must be confirmed adults");
  }
  if(coercedOrNonConsensual){
    throw new MaturePolicyError("NONCONSENSUAL_BLOCKED","Non-consensual sexual content is not allowed");
  }
  if(subjectType==="real_person"&&!consentConfirmed){
    throw new MaturePolicyError("CONSENT_REQUIRED","Real-person sexual content requires explicit consent confirmation");
  }
  return {
    ok:true,
    capability,
    subjectType,
    consentConfirmed:Boolean(consentConfirmed),
    allAdultsConfirmed:true,
  };
}
