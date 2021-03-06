
function run_test() {
  // Test that minidump-analyzer gracefully handles chained
  // IMAGE_RUNTIME_FUNCTION_ENTRY items that form a circular reference
  // (infinite loop).
  let exe = do_get_file("test_crash_win64cfi_infinite_entry_chain.exe");
  ok(exe);

  // Perform a crash. We won't get unwind info, but make sure the stack scan
  // still works.
  do_x64CFITest("CRASH_X64CFI_ALLOC_SMALL",
    [
      { symbol: "CRASH_X64CFI_ALLOC_SMALL", trust: "context" },
      { symbol: "CRASH_X64CFI_NO_MANS_LAND", trust: null }
    ],
    ["--force-use-module", exe.path]);
}
