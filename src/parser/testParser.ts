import { ContentParser } from './ContentParser';
import * as fs from 'fs/promises';
import * as path from 'path';

// Sample HTML that mimics Apple HIG page structure
const sampleHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Buttons - Human Interface Guidelines - Apple Developer</title>
    <meta name="description" content="Learn how to design buttons that are easy to tap and clearly communicate their purpose.">
</head>
<body>
    <nav aria-label="Breadcrumb">
        <a href="/design">Design</a>
        <a href="/design/human-interface-guidelines">Human Interface Guidelines</a>
        <a href="/design/human-interface-guidelines/components">Components</a>
    </nav>
    
    <main>
        <article>
            <h1>Buttons</h1>
            <p class="lead">Buttons initiate app-specific actions, have customizable backgrounds, and can include a title or an icon.</p>
            
            <section id="overview">
                <h2>Overview</h2>
                <p>The system provides a number of predefined button styles for most common use cases. You can also design a fully custom button.</p>
                
                <figure>
                    <img src="/design/human-interface-guidelines/images/buttons-hero.png" alt="Various button styles in iOS">
                    <figcaption>System button styles provide visual consistency across apps.</figcaption>
                </figure>
            </section>
            
            <section id="best-practices">
                <h2>Best Practices</h2>
                <p>Create buttons that are easy to tap and clearly communicate their purpose.</p>
                
                <ul>
                    <li>Use verbs in titles. An action-specific title shows that a button is interactive and says what happens when you tap it.</li>
                    <li>Use title-case for titles with four or fewer words.</li>
                    <li>Keep titles short. Overly long text can crowd your interface and may get truncated on smaller screens.</li>
                </ul>
                
                <div class="code-example">
                    <h3>SwiftUI Example</h3>
                    <pre><code class="language-swift">
struct ContentView: View {
    var body: some View {
        Button("Sign In") {
            // Handle sign in
            signIn()
        }
        .buttonStyle(.borderedProminent)
    }
}
                    </code></pre>
                </div>
                
                <div class="code-example">
                    <h3>UIKit Example</h3>
                    <pre><code class="language-swift">
let button = UIButton(type: .system)
button.setTitle("Sign In", for: .normal)
button.addTarget(self, action: #selector(signInTapped), for: .touchUpInside)
                    </code></pre>
                </div>
            </section>
            
            <section id="specifications">
                <h2>Specifications</h2>
                <p>Follow these guidelines to ensure your buttons meet accessibility standards.</p>
                
                <table>
                    <caption>Minimum button sizes by platform</caption>
                    <thead>
                        <tr>
                            <th>Platform</th>
                            <th>Minimum Size</th>
                            <th>Recommended Size</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>iOS</td>
                            <td>44x44 pt</td>
                            <td>44x44 pt or larger</td>
                        </tr>
                        <tr>
                            <td>iPadOS</td>
                            <td>44x44 pt</td>
                            <td>44x44 pt or larger</td>
                        </tr>
                        <tr>
                            <td>macOS</td>
                            <td>24x24 pt</td>
                            <td>32x32 pt or larger</td>
                        </tr>
                    </tbody>
                </table>
            </section>
            
            <section id="platform-specific">
                <h2>Platform Considerations</h2>
                
                <div role="tabpanel" aria-label="iOS platform">
                    <h3>iOS</h3>
                    <p>On iOS, buttons can adapt their appearance based on their context and the containing view's style.</p>
                    
                    <pre><code class="language-swift">
// iOS-specific button configuration
var config = UIButton.Configuration.filled()
config.title = "Continue"
config.baseBackgroundColor = .systemBlue
config.cornerStyle = .medium

let button = UIButton(configuration: config)
                    </code></pre>
                </div>
                
                <div role="tabpanel" aria-label="macOS platform">
                    <h3>macOS</h3>
                    <p>On macOS, buttons follow the system appearance and support keyboard shortcuts.</p>
                    
                    <pre><code class="language-swift">
// macOS-specific button
let button = NSButton(title: "Save", target: self, action: #selector(saveDocument))
button.keyEquivalent = "s"
button.keyEquivalentModifierMask = [.command]
                    </code></pre>
                </div>
            </section>
        </article>
    </main>
    
    <footer>
        <p>Copyright © 2024 Apple Inc. All rights reserved.</p>
    </footer>
    
    <script>
        // This should be removed by the parser
        console.log("Analytics script");
    </script>
</body>
</html>
`;

async function testParser() {
    const parser = new ContentParser();
    
    console.log('Testing ContentParser with sample Apple HIG HTML...\n');
    
    try {
        // Parse the HTML
        const parsed = await parser.parse(sampleHTML, 'https://developer.apple.com/design/human-interface-guidelines/buttons');
        
        // Display results
        console.log('=== PARSED CONTENT ===\n');
        console.log(`Title: ${parsed.title}`);
        console.log(`Description: ${parsed.description}\n`);
        
        console.log('Metadata:');
        console.log(`- Breadcrumbs: ${parsed.metadata.breadcrumbs?.join(' > ')}`);
        console.log(`- Platforms: ${parsed.metadata.platforms?.join(', ') || 'Not detected'}\n`);
        
        console.log(`Sections found: ${parsed.sections.length}`);
        parsed.sections.forEach(section => {
            console.log(`- ${section.title} (${section.type}) - Level ${section.level}`);
        });
        
        console.log(`\nImages found: ${parsed.images.length}`);
        parsed.images.forEach(img => {
            console.log(`- ${img.alt}`);
            if (img.caption) console.log(`  Caption: ${img.caption}`);
        });
        
        console.log(`\nCode blocks found: ${parsed.codeBlocks.length}`);
        parsed.codeBlocks.forEach(code => {
            console.log(`- Language: ${code.language}, Platform: ${code.platform || 'general'}`);
            if (code.title) console.log(`  Title: ${code.title}`);
            console.log(`  Preview: ${code.code.split('\n')[0]}...`);
        });
        
        console.log(`\nTables found: ${parsed.tables.length}`);
        parsed.tables.forEach(table => {
            if (table.caption) console.log(`- ${table.caption}`);
            console.log(`  Headers: ${table.headers.join(', ')}`);
            console.log(`  Rows: ${table.rows.length}`);
        });
        
        // Test Markdown conversion
        console.log('\n=== MARKDOWN OUTPUT ===\n');
        const markdown = await parser.parseToMarkdown(sampleHTML, 'https://developer.apple.com/design/human-interface-guidelines/buttons');
        console.log(markdown);
        
        // Save markdown to file
        await fs.writeFile(path.join(__dirname, '../../test-output.md'), markdown);
        console.log('\nMarkdown output saved to test-output.md');
        
    } catch (error) {
        console.error('Error testing parser:', error);
    }
}

// Run the test
testParser();