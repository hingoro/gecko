var gWindowUtils;

try {
  gWindowUtils = SpecialPowers.DOMWindowUtils;
  if (gWindowUtils && !gWindowUtils.compareCanvases)
    gWindowUtils = null;
} catch (e) {
  gWindowUtils = null;
}

function snapshotWindow(win, withCaret) {
  return SpecialPowers.snapshotWindow(win, withCaret);
}

// If the two snapshots don't compare as expected (true for equal, false for
// unequal), returns their serializations as data URIs.  In all cases, returns
// whether the comparison was as expected.
function compareSnapshots(s1, s2, expected) {
  var s1Str, s2Str;
  var correct = false;
  if (gWindowUtils) {
    // First, check that the canvases are the same size.
    var equal;
    if (s1.width != s2.width || s1.height != s2.height) {
      equal = false;
    } else {
      try {
        equal = (gWindowUtils.compareCanvases(s1, s2, {}) == 0);
      } catch (e) {
        equal = false;
        ok(false, "Exception thrown from compareCanvases: " + e);
      }
    }
    correct = (equal == expected);
  }

  if (!correct) {
    s1Str = s1.toDataURL();
    s2Str = s2.toDataURL();

    if (!gWindowUtils) {
	correct = ((s1Str == s2Str) == expected);
    }
  }

  return [correct, s1Str, s2Str];
}
