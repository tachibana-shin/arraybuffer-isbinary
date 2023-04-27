# arraybuffer-isbinary

Detects if a file is binary in all platform. Similar to Perl's -B

### Install
```bash
pnpm add arraybuffer-isbinary
```

### Usage
```ts
import { isBinaryFile } from "arraybuffer-isbinary"

console.log(isBinaryFile(buffer))
```