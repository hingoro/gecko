// |reftest| error:SyntaxError
// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: Single and Multi line comments are used together
es5id: 7.4_A4_T4
description: Try to open Multi line comment at the end of Single comment
negative:
  phase: parse
  type: SyntaxError
---*/

throw "Test262: This statement should not be evaluated.";

/*CHECK#1*/

// var /* 
x*/
