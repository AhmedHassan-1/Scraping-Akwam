export class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class JobNotFoundException extends DomainException {
  constructor(public readonly jobId: string) {
    super(`المهمة رقم ${jobId} غير موجودة`);
  }
}

export class JobInvalidStateException extends DomainException {
  constructor(message: string) {
    super(message);
  }
}

export class ScrapingException extends DomainException {
  constructor(message: string) {
    super(message);
  }
}
