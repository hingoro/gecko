# Copyright (c) 2010 Google Inc. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

{
  'targets': [
    {
      'target_name': 'all_exes',
      'type': 'none',
      'dependencies': [
        'executable1.gyp:*',
        'executable2.gyp:*',
      ],
    },
  ],
}
