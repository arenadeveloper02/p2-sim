"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, AlertCircle, Upload } from "lucide-react";

export default function FigmaDesignGeneratorPage() {
  const [projectId, setProjectId] = useState("397940050");
  const [fileName, setFileName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [brandGuidelinesFile, setBrandGuidelinesFile] = useState<File | null>(null);
  const [wireframesFile, setWireframesFile] = useState<File | null>(null);
  const [additionalDataFile, setAdditionalDataFile] = useState<File | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    renderedData?: string;
    figmaFileUrl?: string;
    error?: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("projectId", projectId);
      formData.append("fileName", fileName);
      formData.append("prompt", prompt);
      
      if (additionalInfo) {
        formData.append("additionalInfo", additionalInfo);
      }
      
      if (brandGuidelinesFile) {
        formData.append("brandGuidelinesFile", brandGuidelinesFile);
      }
      
      if (wireframesFile) {
        formData.append("wireframesFile", wireframesFile);
      }
      
      if (additionalDataFile) {
        formData.append("additionalDataFile", additionalDataFile);
      }

      const response = await fetch("/api/figma/generate-design", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Figma Design Generator</h1>
        <p className="text-muted-foreground">
          Generate Figma designs automatically using AI and browser automation
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Design Configuration</CardTitle>
          <CardDescription>
            Provide the details for your Figma design generation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Required Fields */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="projectId">
                  Project ID <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="projectId"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="397940050"
                  required
                />
                <p className="text-sm text-muted-foreground mt-1">
                  The Figma project ID from the project URL
                </p>
              </div>

              <div>
                <Label htmlFor="fileName">
                  File Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="fileName"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="My AI Generated Design"
                  required
                />
              </div>

              <div>
                <Label htmlFor="prompt">
                  Design Prompt <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Create a modern landing page for a SaaS product with a hero section, features section, and CTA buttons..."
                  rows={4}
                  required
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Describe the design you want to generate
                </p>
              </div>
            </div>

            {/* Optional File Uploads */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold text-sm">Optional Files</h3>
              
              <div>
                <Label htmlFor="brandGuidelines">Brand Guidelines</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    id="brandGuidelines"
                    type="file"
                    onChange={(e) => setBrandGuidelinesFile(e.target.files?.[0] || null)}
                    accept=".txt,.pdf,.docx,.md"
                  />
                  {brandGuidelinesFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setBrandGuidelinesFile(null)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="wireframes">Wireframes</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    id="wireframes"
                    type="file"
                    onChange={(e) => setWireframesFile(e.target.files?.[0] || null)}
                    accept=".txt,.pdf,.docx,.md"
                  />
                  {wireframesFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setWireframesFile(null)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="additionalData">Additional Data</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    id="additionalData"
                    type="file"
                    onChange={(e) => setAdditionalDataFile(e.target.files?.[0] || null)}
                    accept=".txt,.pdf,.docx,.md"
                  />
                  {additionalDataFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAdditionalDataFile(null)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Additional Information */}
            <div className="border-t pt-4">
              <Label htmlFor="additionalInfo">Additional Information</Label>
              <Textarea
                id="additionalInfo"
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
                placeholder="Any additional context or requirements..."
                rows={3}
              />
            </div>

            {/* Submit Button */}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Design...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Generate Figma Design
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Result Display */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.success ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Design Generated Successfully
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  Generation Failed
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.success ? (
              <>
                {result.figmaFileUrl && (
                  <div>
                    <Label>Figma File URL</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        value={result.figmaFileUrl}
                        readOnly
                        className="flex-1"
                      />
                      <Button
                        onClick={() => window.open(result.figmaFileUrl, "_blank")}
                      >
                        Open
                      </Button>
                    </div>
                  </div>
                )}
                
                {result.renderedData && (
                  <div>
                    <Label>Generated HTML/CSS</Label>
                    <Textarea
                      value={result.renderedData}
                      readOnly
                      rows={10}
                      className="font-mono text-xs mt-1"
                    />
                  </div>
                )}
              </>
            ) : (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{result.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card className="mt-6 bg-muted/50">
        <CardHeader>
          <CardTitle className="text-lg">How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Provide your Figma project ID, desired file name, and design prompt</li>
            <li>Optionally upload brand guidelines, wireframes, or additional data</li>
            <li>The system reads your files and creates a comprehensive system prompt</li>
            <li>Claude AI generates HTML and CSS based on your requirements</li>
            <li>Selenium automation logs into Figma and creates a new design file</li>
            <li>The generated design is automatically rendered in Figma using the plugin</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

