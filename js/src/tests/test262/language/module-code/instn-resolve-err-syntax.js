// |reftest| error:SyntaxError module
// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
description: Requested modules that produce an early SyntaxError
esid: sec-moduledeclarationinstantiation
info: |
    [...]
    8. For each String required that is an element of
       module.[[RequestedModules]] do,
       [...]
       b. Let requiredModule be ? HostResolveImportedModule(module, required).
    [...]
negative:
  phase: resolution
  type: SyntaxError
flags: [module]
---*/

throw "Test262: This statement should not be evaluated.";

import './instn-resolve-err-syntax_FIXTURE.js';
