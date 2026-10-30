/**
 * Curated interview question bank.
 *
 * Each entry links to a well-known practice problem and carries paraphrased
 * prompts plus progressive hints, so the bot can coach without dumping the
 * full solution. Add your own by following the same shape.
 */
function problem(id, title, difficulty, topics, prompt, hints) {
  return {
    id,
    title,
    difficulty,
    topics,
    prompt,
    hints,
    link: `https://leetcode.com/problems/${id}/`,
  };
}

export const BANK = [
  // ---------------------------------------------------------------- easy
  problem(
    'two-sum',
    'Two Sum',
    'easy',
    ['arrays', 'hash-table'],
    'Given an array of integers and a target, return the indices of the two numbers that add up to the target. Exactly one valid answer exists, and you may not reuse an element.',
    [
      'Brute force checks every pair in O(n^2). What information would let you skip the inner loop?',
      'Walk the array once and keep a map from value to index - for each number, look for target minus that number.',
    ],
  ),
  problem(
    'valid-parentheses',
    'Valid Parentheses',
    'easy',
    ['stack', 'strings'],
    'Given a string containing only brackets, decide whether every opening bracket is closed by the matching type in the correct order.',
    ['The most recently opened bracket must close first. Which data structure gives you that?', 'Push openings; on a closing bracket pop and compare. The stack must be empty at the end.'],
  ),
  problem(
    'merge-two-sorted-lists',
    'Merge Two Sorted Lists',
    'easy',
    ['linked-list', 'recursion'],
    'Merge two sorted singly linked lists into one sorted list by splicing the existing nodes together.',
    ['Compare the two current heads and attach the smaller one.', 'A dummy head node removes the special case for the very first node.'],
  ),
  problem(
    'best-time-to-buy-and-sell-stock',
    'Best Time to Buy and Sell Stock',
    'easy',
    ['arrays', 'dp', 'greedy'],
    'Given daily stock prices, choose one day to buy and a later day to sell so that the profit is maximised. Return 0 if no profit is possible.',
    ['For each selling day you only need the cheapest price seen so far.', 'One pass tracking minimum price and best profit is enough.'],
  ),
  problem(
    'valid-palindrome',
    'Valid Palindrome',
    'easy',
    ['strings', 'two-pointers'],
    'Decide whether a string reads the same forwards and backwards, ignoring case and characters that are not letters or digits.',
    ['Skip non-alphanumeric characters and compare from both ends.', 'Two pointers moving inward give O(n) time and O(1) extra space.'],
  ),
  problem(
    'invert-binary-tree',
    'Invert Binary Tree',
    'easy',
    ['trees', 'recursion'],
    'Mirror a binary tree so that every left child becomes a right child and vice versa.',
    ['Swap the two children of a node, then recurse into both.', 'An explicit stack or queue gives an iterative version without recursion.'],
  ),
  problem(
    'linked-list-cycle',
    'Linked List Cycle',
    'easy',
    ['linked-list', 'two-pointers'],
    'Detect whether a linked list contains a cycle, without modifying the list.',
    ['A hash set of visited nodes works but costs O(n) space.', 'Floyd tortoise and hare: a slow pointer and a fast pointer must meet inside a cycle.'],
  ),
  problem(
    'maximum-subarray',
    'Maximum Subarray',
    'easy',
    ['arrays', 'dp', 'divide-and-conquer'],
    'Find the contiguous subarray with the largest sum and return that sum.',
    ['Would you ever want to keep a running sum that has already turned negative?', 'Kadane: running = max(x, running + x), answer = max(answer, running).'],
  ),
  problem(
    'climbing-stairs',
    'Climbing Stairs',
    'easy',
    ['dp', 'recursion', 'math'],
    'You can climb 1 or 2 steps at a time. Count the distinct ways to reach step n.',
    ['Ways(n) = ways(n-1) + ways(n-2) - it is Fibonacci in disguise.', 'You only need the previous two values, not the whole array.'],
  ),
  problem(
    'binary-search',
    'Binary Search',
    'easy',
    ['binary-search', 'arrays'],
    'Given a sorted array and a target, return the index of the target in O(log n), or -1 when absent.',
    ['Halve the search range each iteration with clear inclusive bounds.', 'Prefer mid = left + (right - left) / 2 and keep one loop invariant in mind.'],
  ),
  problem(
    'reverse-linked-list',
    'Reverse Linked List',
    'easy',
    ['linked-list', 'recursion'],
    'Reverse a singly linked list in place and return the new head.',
    ['You need three references: previous, current and next.', 'Save next before rewiring current.next, then advance all three.'],
  ),
  problem(
    'majority-element',
    'Majority Element',
    'easy',
    ['arrays', 'hash-table', 'sorting'],
    'Return the element that appears more than n/2 times. It is guaranteed to exist.',
    ['Sorting puts the majority element at index n/2.', 'Boyer-Moore voting keeps a candidate and a count in O(1) space.'],
  ),
  problem(
    'contains-duplicate',
    'Contains Duplicate',
    'easy',
    ['arrays', 'hash-table', 'sorting'],
    'Return true if any value appears at least twice in the array.',
    ['A hash set answers "have I seen this value" in O(1).', 'Comparing the set size with the array length is a one-liner.'],
  ),
  problem(
    'move-zeroes',
    'Move Zeroes',
    'easy',
    ['arrays', 'two-pointers'],
    'Move every zero to the end while keeping the relative order of non-zero elements, in place.',
    ['Keep a write pointer for the next non-zero slot.', 'Two passes: compact non-zeroes forward, then fill the tail with zeroes.'],
  ),
  problem(
    'single-number',
    'Single Number',
    'easy',
    ['bit-manipulation', 'arrays'],
    'Every element appears twice except for one. Find that element in linear time and constant extra space.',
    ['XOR of a number with itself is 0.', 'XOR every element together - all the pairs cancel out.'],
  ),
  problem('plus-one', 'Plus One', 'easy', ['arrays', 'math'], 'Increment a non-negative integer that is given as an array of digits.', [
    'Walk from the end and carry while digits are 9.',
    'If every digit was 9, the result is 1 followed by that many zeroes.',
  ]),
  problem(
    'first-bad-version',
    'First Bad Version',
    'easy',
    ['binary-search'],
    'Versions are numbered 1..n and isBadVersion(v) is monotonic: once a version is bad, all later ones are too. Find the first bad version with as few calls as possible.',
    ['The predicate looks like false...false,true...true.', 'Binary search for the leftmost true value.'],
  ),
  problem(
    'flood-fill',
    'Flood Fill',
    'easy',
    ['graphs', 'recursion'],
    'Recolour the region of connected same-coloured pixels starting from (sr, sc).',
    ['BFS or DFS over the four directional neighbours.', 'Return early if the starting pixel already has the new colour - it prevents infinite recursion.'],
  ),
  problem(
    'lowest-common-ancestor-of-a-binary-search-tree',
    'Lowest Common Ancestor of a BST',
    'easy',
    ['trees', 'recursion'],
    'Find the lowest common ancestor of two nodes in a binary search tree.',
    ['Both values smaller means go left; both larger means go right.', 'The first node whose value lies between the two values is the answer.'],
  ),
  problem(
    'diameter-of-binary-tree',
    'Diameter of Binary Tree',
    'easy',
    ['trees', 'recursion'],
    'Return the length (in edges) of the longest path between any two nodes in a binary tree.',
    ['The best path through a node is left height + right height.', 'Return the height while updating a global maximum.'],
  ),
  problem(
    'implement-queue-using-stacks',
    'Implement Queue using Stacks',
    'easy',
    ['stack', 'design'],
    'Implement a first-in-first-out queue using only stack operations.',
    ['Use one stack for input and one for output.', 'Only move elements across when the output stack is empty - then each element moves at most once.'],
  ),
  problem(
    'missing-number',
    'Missing Number',
    'easy',
    ['arrays', 'math', 'bit-manipulation'],
    'An array holds n distinct numbers from the range 0..n with exactly one missing. Find it.',
    ['Sum of 0..n minus the array sum is the answer.', 'XOR of all indices and all values also isolates it.'],
  ),

  // -------------------------------------------------------------- medium
  problem(
    'add-two-numbers',
    'Add Two Numbers',
    'medium',
    ['linked-list', 'math'],
    'Two non-negative integers are stored as reversed digit linked lists. Return their sum as a linked list in the same format.',
    ['Walk both lists with a carry, exactly like school addition.', 'Use a dummy head and do not forget a final carry after both lists end.'],
  ),
  problem(
    'longest-substring-without-repeating-characters',
    'Longest Substring Without Repeating Characters',
    'medium',
    ['strings', 'sliding-window', 'hash-table'],
    'Return the length of the longest substring that contains no repeated characters.',
    ['Maintain a sliding window plus a map from character to its last index.', 'When you hit a repeat, jump the left edge to one past its previous position.'],
  ),
  problem(
    'longest-palindromic-substring',
    'Longest Palindromic Substring',
    'medium',
    ['strings', 'dp', 'two-pointers'],
    'Return the longest palindromic substring of a string.',
    ['Every palindrome grows outward from a centre, and centres can be a character or a gap.', 'Expand around all 2n-1 centres for an O(n^2) solution.'],
  ),
  problem(
    'container-with-most-water',
    'Container With Most Water',
    'medium',
    ['arrays', 'two-pointers', 'greedy'],
    'Two vertical lines plus the x-axis form a container. Choose the pair of lines that traps the most water.',
    ['Area = min(height[l], height[r]) * (r - l).', 'Start with the widest pair and move the shorter side inward - moving the taller side can never help.'],
  ),
  problem('three-sum', '3Sum', 'medium', ['arrays', 'two-pointers', 'sorting'], 'Return all unique triplets in the array that sum to zero.', [
    'Sort the array, then fix one value and use two pointers for the rest.',
    'Skip duplicate values at each level to avoid repeated triplets.',
  ]),
  problem('group-anagrams', 'Group Anagrams', 'medium', ['strings', 'hash-table', 'sorting'], 'Group words that are anagrams of one another.', [
    'Anagrams share a canonical form.',
    'Use the sorted word, or a 26-length character count, as the map key.',
  ]),
  problem(
    'product-of-array-except-self',
    'Product of Array Except Self',
    'medium',
    ['arrays', 'prefix-sum'],
    'Return an array where each position holds the product of every other element. Division is not allowed.',
    ['Compute prefix products in one pass and suffix products in another.', 'Reuse the output array for the prefix pass to keep extra space constant.'],
  ),
  problem('merge-intervals', 'Merge Intervals', 'medium', ['intervals', 'sorting', 'arrays'], 'Merge all overlapping intervals and return the non-overlapping result.', [
    'Sort intervals by their start.',
    'Extend the last merged interval whenever the next start is inside it.',
  ]),
  problem(
    'insert-interval',
    'Insert Interval',
    'medium',
    ['intervals', 'arrays'],
    'Insert a new interval into a sorted list of non-overlapping intervals, merging where necessary.',
    ['Work in three phases: entirely before, overlapping, entirely after.', 'When merging, keep updating the merged interval start and end.'],
  ),
  problem('rotate-image', 'Rotate Image', 'medium', ['matrix', 'math'], 'Rotate an n x n matrix 90 degrees clockwise, in place.', [
    'Transpose the matrix, then reverse each row.',
    'Alternatively rotate four cells at a time within concentric rings.',
  ]),
  problem('spiral-matrix', 'Spiral Matrix', 'medium', ['matrix', 'simulation'], 'Return all elements of a matrix in clockwise spiral order.', [
    'Track top, bottom, left and right boundaries.',
    'Shrink each boundary after traversing it, and re-check the bounds before the next pass.',
  ]),
  problem(
    'set-matrix-zeroes',
    'Set Matrix Zeroes',
    'medium',
    ['matrix', 'hash-table'],
    'If a cell is zero, set its entire row and column to zero, using the matrix itself for storage.',
    ['The first row and first column can act as flags for the other rows and columns.', 'Track separately whether the first row or column themselves contained a zero.'],
  ),
  problem('word-break', 'Word Break', 'medium', ['dp', 'strings', 'tries'], 'Decide whether a string can be split entirely into words from a dictionary.', [
    'dp[i] answers: can the prefix of length i be segmented?',
    'For each i, look for a j < i where dp[j] is true and s[j..i) is a dictionary word.',
  ]),
  problem('coin-change', 'Coin Change', 'medium', ['dp', 'bfs'], 'Return the fewest coins needed to make an amount, or -1 when it is impossible.', [
    'dp[a] = fewest coins for amount a, with dp[0] = 0.',
    'Iterate amounts upward and relax dp[a] with each coin.',
  ]),
  problem(
    'longest-increasing-subsequence',
    'Longest Increasing Subsequence',
    'medium',
    ['dp', 'binary-search'],
    'Return the length of the longest strictly increasing subsequence.',
    ['O(n^2) DP: best[i] = 1 + max(best[j]) over j < i with nums[j] < nums[i].', 'Patience sorting with binary search improves this to O(n log n).'],
  ),
  problem('house-robber', 'House Robber', 'medium', ['dp'], 'Rob houses along a street for maximum money, but never two adjacent houses.', [
    'At each house, either take it plus the best from two houses back, or skip it.',
    'Two rolling variables are enough to hold those two states.',
  ]),
  problem('unique-paths', 'Unique Paths', 'medium', ['dp', 'math'], 'Count paths from the top-left to the bottom-right of a grid moving only right or down.', [
    'paths[i][j] = paths[i-1][j] + paths[i][j-1].',
    'A single row of DP is sufficient because each cell only needs the one above and the one to the left.',
  ]),
  problem('jump-game', 'Jump Game', 'medium', ['greedy', 'arrays'], 'Each element is the maximum jump length from that position. Decide whether you can reach the last index.', [
    'Track the furthest index reachable so far while scanning left to right.',
    'If your current index ever exceeds that reach, you are stuck.',
  ]),
  problem('number-of-islands', 'Number of Islands', 'medium', ['graphs', 'bfs', 'dfs'], 'Count the connected groups of land cells in a grid.', [
    'Every unvisited land cell starts exactly one island.',
    'Flood fill it with BFS or DFS so it is never counted twice.',
  ]),
  problem('clone-graph', 'Clone Graph', 'medium', ['graphs', 'hash-table', 'dfs'], 'Return a deep copy of a connected undirected graph.', [
    'Keep a map from original node to its clone.',
    'Traverse with BFS or DFS and clone neighbours on demand.',
  ]),
  problem(
    'course-schedule',
    'Course Schedule',
    'medium',
    ['graphs', 'topological-sort'],
    'Given prerequisite pairs, decide whether all courses can be completed.',
    ['The prerequisite graph must contain no cycle.', "Kahn's algorithm repeatedly removes nodes with indegree zero."],
  ),
  problem(
    'pacific-atlantic-water-flow',
    'Pacific Atlantic Water Flow',
    'medium',
    ['graphs', 'dfs', 'bfs'],
    'Find cells from which water can flow to both the Pacific and Atlantic oceans.',
    ['Reverse the flow: start at each ocean border and walk to equal-or-higher neighbours.', 'Intersect the set reachable from the Pacific with the set reachable from the Atlantic.'],
  ),
  problem('kth-largest-element-in-an-array', 'Kth Largest Element in an Array', 'medium', ['heap', 'sorting', 'quickselect'], 'Return the k-th largest element in an unsorted array.', [
    'A min-heap of size k keeps exactly the k largest elements seen so far.',
    'Quickselect averages O(n) time but needs careful pivot handling.',
  ]),
  problem('top-k-frequent-elements', 'Top K Frequent Elements', 'medium', ['heap', 'hash-table', 'bucket-sort'], 'Return the k most frequent values in an array.', [
    'Count frequencies with a hash map first.',
    'Bucket sort by frequency gives O(n); a heap of size k is the simpler alternative.',
  ]),
  problem('implement-trie-prefix-tree', 'Implement Trie (Prefix Tree)', 'medium', ['tries', 'design'], 'Implement insert, search and startsWith for a prefix tree.', [
    'Each node holds a map of children plus an end-of-word flag.',
    'startsWith stops at the last character; search additionally checks the end flag.',
  ]),
  problem('lru-cache', 'LRU Cache', 'medium', ['design', 'linked-list', 'hash-table'], 'Design a cache with O(1) get and put that evicts the least recently used entry when full.', [
    'Combine a hash map for lookup with a doubly linked list for recency.',
    'Move a touched node to the front and evict from the tail.',
  ]),
  problem(
    'binary-tree-level-order-traversal',
    'Binary Tree Level Order Traversal',
    'medium',
    ['trees', 'bfs'],
    'Return the node values of a binary tree level by level.',
    ['BFS with a queue, processing the queue length once per level.', 'That inner loop over the initial length is what keeps the levels separate.'],
  ),
  problem('validate-binary-search-tree', 'Validate Binary Search Tree', 'medium', ['trees', 'dfs'], 'Check whether a binary tree is a valid binary search tree.', [
    'Each node must lie strictly inside an open (low, high) range passed down from its ancestors.',
    'An inorder traversal must be strictly increasing - that version is easier to get right.',
  ]),
  problem('kth-smallest-element-in-a-bst', 'Kth Smallest Element in a BST', 'medium', ['trees', 'stack'], 'Return the k-th smallest value in a binary search tree.', [
    'An inorder traversal visits values in sorted order.',
    'An iterative inorder traversal lets you stop after k nodes instead of walking the whole tree.',
  ]),
  problem(
    'search-in-rotated-sorted-array',
    'Search in Rotated Sorted Array',
    'medium',
    ['binary-search', 'arrays'],
    'Search for a target in a rotated sorted array in O(log n).',
    ['At every step at least one half of the range is properly sorted.', 'Identify the sorted half, then check whether the target lies inside its range.'],
  ),
  problem(
    'evaluate-reverse-polish-notation',
    'Evaluate Reverse Polish Notation',
    'medium',
    ['stack', 'math'],
    'Evaluate an arithmetic expression written in postfix notation.',
    ['Push operands; on an operator, pop two values and push the result.', 'Operand order matters: the second pop is the left-hand operand.'],
  ),
  problem('daily-temperatures', 'Daily Temperatures', 'medium', ['stack', 'monotonic-stack', 'arrays'], 'For each day, return how many days until a warmer temperature, or 0 if none comes.', [
    'Use a monotonic decreasing stack of indices.',
    'Pop while the current temperature is warmer than the temperature at the stack top.',
  ]),
  problem('subsets', 'Subsets', 'medium', ['backtracking', 'bit-manipulation'], 'Return all subsets of an array of distinct integers.', [
    'At each element decide whether to include it or exclude it.',
    'Backtracking with a path array and an index is the cleanest formulation.',
  ]),
  problem('permutations', 'Permutations', 'medium', ['backtracking'], 'Return all permutations of an array of distinct integers.', [
    'Build the permutation one position at a time.',
    'Swap-based backtracking avoids allocating a new array at every step.',
  ]),
  problem('combination-sum', 'Combination Sum', 'medium', ['backtracking', 'arrays'], 'Find all combinations of candidates that sum to a target. Each candidate may be reused.', [
    'Sort the candidates so you can stop a branch early.',
    'Pass the current index forward to avoid generating duplicate combinations.',
  ]),
  problem(
    'letter-combinations-of-a-phone-number',
    'Letter Combinations of a Phone Number',
    'medium',
    ['backtracking', 'strings'],
    'Return every letter combination that a string of phone digits could represent.',
    ['This is a cartesian product - recursion fits naturally.', 'Track the digit index and the prefix built so far.'],
  ),
  problem('word-search', 'Word Search', 'medium', ['backtracking', 'matrix'], 'Can a word be traced through adjacent grid cells without reusing a cell?', [
    'DFS from every cell whose letter matches the first character.',
    'Mark a cell visited during the search and restore it when you backtrack.',
  ]),
  problem('palindromic-substrings', 'Palindromic Substrings', 'medium', ['strings', 'dp'], 'Count how many substrings of a string are palindromes.', [
    'Expand around every centre and count each successful expansion.',
    'There are 2n-1 centres once you include even-length palindromes.',
  ]),
  problem('decode-ways', 'Decode Ways', 'medium', ['dp', 'strings'], 'Count the number of ways to decode a digit string where 1-26 map to letters.', [
    'dp[i] depends on the one-digit and two-digit endings at position i.',
    "Reject a lone '0' and any pair above 26.",
  ]),
  problem(
    'partition-equal-subset-sum',
    'Partition Equal Subset Sum',
    'medium',
    ['dp', 'arrays'],
    'Can the array be split into two subsets with equal sums?',
    ['This is subset sum with target total/2.', 'A 1-D boolean DP over achievable sums, iterated backwards, keeps space at O(target).'],
  ),
  problem('gas-station', 'Gas Station', 'medium', ['greedy', 'arrays'], 'Find the starting station index that lets you complete a circular route, or -1.', [
    'If total gas is less than total cost, no answer exists.',
    'Reset the candidate start whenever the running tank goes negative.',
  ]),
  problem(
    'longest-consecutive-sequence',
    'Longest Consecutive Sequence',
    'medium',
    ['arrays', 'hash-table'],
    'Return the length of the longest run of consecutive integers in an unsorted array, in O(n).',
    ['Put every number in a hash set.', 'Only start counting from numbers whose predecessor (n-1) is absent from the set.'],
  ),
  problem('course-schedule-ii', 'Course Schedule II', 'medium', ['graphs', 'topological-sort'], 'Return one valid order in which all courses can be taken, or an empty array if impossible.', [
    "Topological sort with Kahn's algorithm.",
    'Append nodes as their indegree reaches zero; a short output means there is a cycle.',
  ]),
  problem('subarray-sum-equals-k', 'Subarray Sum Equals K', 'medium', ['arrays', 'hash-table', 'prefix-sum'], 'Count the contiguous subarrays whose sum equals k.', [
    'prefix[j] - prefix[i] = k means prefix[i] = prefix[j] - k.',
    'Keep a map of prefix-sum frequencies while scanning.',
  ]),
  problem('minimum-size-subarray-sum', 'Minimum Size Subarray Sum', 'medium', ['sliding-window', 'arrays'], 'Return the length of the shortest subarray whose sum is at least a target.', [
    'Because all numbers are positive, a sliding window works.',
    'Shrink from the left while the window sum still satisfies the target.',
  ]),
  problem(
    'find-minimum-in-rotated-sorted-array',
    'Find Minimum in Rotated Sorted Array',
    'medium',
    ['binary-search', 'arrays'],
    'Find the minimum value in a rotated sorted array of distinct numbers, in O(log n).',
    ['Compare the middle element with the right edge.', 'If nums[mid] > nums[right], the minimum must be to the right of mid.'],
  ),
  problem('sort-colors', 'Sort Colors', 'medium', ['arrays', 'two-pointers', 'sorting'], 'Sort an array of 0s, 1s and 2s in place in a single pass.', [
    'The Dutch national flag algorithm uses three pointers: low, mid, high.',
    'Swap 0s to the front and 2s to the back while mid scans forward.',
  ]),
  problem('next-permutation', 'Next Permutation', 'medium', ['arrays', 'two-pointers'], 'Rearrange the numbers into the next lexicographically greater permutation, in place.', [
    'Scan from the right for the first index where nums[i] < nums[i+1].',
    'Swap that value with the smallest larger value to its right, then reverse the suffix.',
  ]),
  problem('maximum-product-subarray', 'Maximum Product Subarray', 'medium', ['dp', 'arrays'], 'Find the contiguous subarray with the largest product.', [
    'A negative number flips the sign, so track both the running maximum and minimum.',
    'Update both products before overwriting either variable.',
  ]),
  problem('rotate-array', 'Rotate Array', 'medium', ['arrays', 'math'], 'Rotate an array to the right by k steps, in place.', [
    'Reverse the whole array, then reverse the first k and the remaining elements.',
    'Remember to reduce k modulo the array length.',
  ]),

  // ---------------------------------------------------------------- hard
  problem(
    'median-of-two-sorted-arrays',
    'Median of Two Sorted Arrays',
    'hard',
    ['binary-search', 'arrays'],
    'Return the median of two sorted arrays in O(log(min(n, m))) time.',
    ['Think about partitioning both arrays into a left half and a right half of equal total size.', 'Binary search the partition point in the smaller array and verify maxLeft <= minRight.'],
  ),
  problem('trapping-rain-water', 'Trapping Rain Water', 'hard', ['two-pointers', 'stack', 'arrays'], 'Compute how much rain water a histogram can trap.', [
    'Water above a bar is limited by the shorter of the tallest bars on its left and right.',
    'Two pointers with running left-max and right-max solve it in O(1) space.',
  ]),
  problem('merge-k-sorted-lists', 'Merge k Sorted Lists', 'hard', ['heap', 'linked-list', 'divide-and-conquer'], 'Merge k sorted linked lists into one sorted list.', [
    'A min-heap of the current heads gives O(N log k).',
    'Repeatedly pairwise-merging (divide and conquer) is an equally good alternative.',
  ]),
  problem(
    'largest-rectangle-in-histogram',
    'Largest Rectangle in Histogram',
    'hard',
    ['stack', 'monotonic-stack', 'arrays'],
    'Find the area of the largest rectangle that fits inside a histogram.',
    ['For each bar you need the nearest shorter bar on both sides.',
    'A monotonic increasing stack of indices finds those boundaries in one pass.',
  ]),
  problem(
    'minimum-window-substring',
    'Minimum Window Substring',
    'hard',
    ['sliding-window', 'hash-table', 'strings'],
    'Find the smallest substring of s that contains every character of t, including multiplicities.',
    ['Expand the right edge until the window is valid, then shrink the left edge while it stays valid.',
    'Track how many required characters are currently satisfied instead of comparing full maps each time.',
  ]),
  problem(
    'serialize-and-deserialize-binary-tree',
    'Serialize and Deserialize Binary Tree',
    'hard',
    ['trees', 'design', 'dfs'],
    'Design an algorithm that serialises a binary tree to a string and rebuilds it exactly.',
    ['Preorder traversal with explicit null markers is enough to rebuild the shape.',
    'Consume the tokens in the same order during deserialisation.',
  ]),
  problem(
    'binary-tree-maximum-path-sum',
    'Binary Tree Maximum Path Sum',
    'hard',
    ['trees', 'dfs', 'dp'],
    'Find the maximum path sum between any two nodes in a tree. A path may start and end anywhere.',
    ['A node can contribute at most one branch upward, but both branches to its own best path.',
    'Return max(0, node + best single branch) upward while updating a global answer with node + left + right.',
  ]),
  problem(
    'find-median-from-data-stream',
    'Find Median from Data Stream',
    'hard',
    ['heap', 'design'],
    'Support adding numbers and querying the median at any time.',
    ['Keep a max-heap for the lower half and a min-heap for the upper half.',
    'Rebalance so their sizes differ by at most one.',
  ]),
  problem('sliding-window-maximum', 'Sliding Window Maximum', 'hard', ['sliding-window', 'monotonic-stack', 'heap'], 'Return the maximum of every window of size k.', [
    'A monotonic decreasing deque stores candidate indices.',
    'Pop from the back while the incoming value is larger, and from the front when it leaves the window.',
  ]),
  problem('edit-distance', 'Edit Distance', 'hard', ['dp', 'strings'], 'Find the minimum number of insertions, deletions and replacements to turn one word into another.', [
    'dp[i][j] = edits to convert the first i characters into the first j characters.',
    'When characters match, dp[i][j] = dp[i-1][j-1]; otherwise take 1 + the best of the three neighbours.',
  ]),
  problem('n-queens', 'N-Queens', 'hard', ['backtracking'], 'Place n queens on an n x n board so that none attack each other, and return all solutions.', [
    'Place one queen per row and recurse.',
    'Track occupied columns and both diagonals (row+col and row-col) as sets for O(1) checks.',
  ]),
  problem('word-ladder', 'Word Ladder', 'hard', ['graphs', 'bfs', 'strings'], 'Find the length of the shortest transformation sequence from one word to another, changing one letter at a time.', [
    'This is a shortest-path problem on a word graph - use BFS.',
    'Generate neighbours by trying all 26 letters at each position, and remove visited words from the dictionary.',
  ]),
  problem(
    'regular-expression-matching',
    'Regular Expression Matching',
    'hard',
    ['dp', 'strings'],
    'Implement matching for a pattern that supports . and *, where * means zero or more of the preceding element.',
    ['dp[i][j] = does the first i characters of s match the first j characters of p?',
    'A * can either match zero occurrences or repeat the previous pattern element.',
  ]),
  problem('longest-valid-parentheses', 'Longest Valid Parentheses', 'hard', ['stack', 'dp', 'strings'], 'Return the length of the longest valid parentheses substring.', [
    'A stack of indices can mark the boundaries of invalid positions.',
    'Push a base index (-1) first, and on a match compute the length from the new stack top.',
  ]),
];

export const BANK_BY_ID = new Map(BANK.map((question) => [question.id, question]));

export const ALL_TOPICS = [...new Set(BANK.flatMap((question) => question.topics))].sort();

export const DIFFICULTIES = ['easy', 'medium', 'hard'];

export function getQuestion(id) {
  return BANK_BY_ID.get(id) ?? null;
}
