/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import {
    IdeasContainer,
    BackButton,
    Section,
    ArticleBox,
    ConversationBubble,
    NoteCard,
    Table,
    Th,
    Td,
    Exercise,
    Instruction,
    NoteGrid,
    EmptyNote,
    AbbreviationList,
    RememberBox,
    AIFeatureBox,
    GenerateButton,
    LoadingText,
    ErrorMessage,
    ResultsContainer
} from './IdeasAndOrganization.styles';

interface IdeasAndOrganizationProps {
    onBack: () => void;
}

const IdeasAndOrganization: React.FC<IdeasAndOrganizationProps> = ({ onBack }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aiIdeas, setAiIdeas] = useState<string | null>(null);

    const handleGenerateIdeas = async () => {
        setLoading(true);
        setError(null);
        setAiIdeas(null);

        try {
            if (!process.env.API_KEY) {
                throw new Error("API_KEY is not set in environment variables.");
            }
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const prompt = `
                You are an expert DSE English speaking exam tutor.
                A student is preparing for a group discussion based on an exam practice question.
                The question is about a gifted university student named Oliver who is struggling with his studies and considering dropping out.
                The discussion points are:
                1. What Oliver could do to deal with his problems.
                2. What kind of support he needs.
                3. How gifted children should develop their strengths and overcome any weaknesses.

                Please brainstorm and provide a concise list of ideas for these discussion points in bullet points.
                The ideas should be practical and suitable for a DSE-level discussion.
                Format the output as a simple list using asterisks for bullet points (e.g., "* Idea 1"). Do not use markdown.
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            setAiIdeas(response.text);

        } catch (e) {
            console.error(e);
            setError("Sorry, something went wrong while generating ideas. Please try again.");
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <IdeasContainer>
            <BackButton onClick={onBack}>← Back to Unit 1</BackButton>
            <h2>Ideas and organization</h2>

            <Section>
                <h3>Understanding the input text</h3>
                <p>In the speaking exam, you will be given a short input text. It is important that you understand this text so that you will be able to talk about it.</p>
                <ul>
                    <li><strong>Main idea</strong> - usually appears at the beginning of the text or in the headline</li>
                    <li><strong>Details</strong> - can be found in the main body of the text</li>
                    <li><strong>Conclusion</strong> - the last part of the text which usually contains a summary of the topic, opinions or suggestions</li>
                </ul>
                <ArticleBox>
                    <h4>Parental involvement helps students succeed</h4>
                    <p>Developing strong study habits at an early age is the key to academic success. It is no secret that many parents in Hong Kong encourage their children to spend more time on homework and enrol in tutorial classes. As a result, many of these students perform well at school.</p>
                    <p>It is <strong>beneficial</strong> when parents play an active role in their children's studies. At home, parents can help their children with homework, or give them advice on understanding tricky concepts. Students who receive parental support may become more <strong>motivated</strong> to work through difficult assignments. In addition, they tend to be well behaved and able to concentrate on tasks for long periods of time.</p>
                </ArticleBox>
                <p>Identifying the main idea and conclusion in the input text will give you a good basis for starting the discussion. For example:</p>
                <ConversationBubble>
                    <p>Hello everyone. Let's start our discussion. Our topic for today's discussion is whether parental involvement at school is good for children. What do you think?</p>
                </ConversationBubble>
                 <p>The details in the input text can give you ideas for talking points. For example:</p>
                 <ConversationBubble>
                    <p>One advantage of parental involvement in education is that children start developing good learning habits at an early age.</p>
                </ConversationBubble>
            </Section>

            <Section>
                <h3>Note-taking skills: organizing your notes</h3>
                <p>You have ten minutes to prepare for the speaking exam. Good note-taking skills will help you make the best use of your time.</p>
                 <Exercise>
                    <Instruction><strong>D2</strong> Chris and Amy have been making notes for the Exam practice question on page 13. In pairs, discuss who you think has better note-taking skills. Why?</Instruction>
                    <NoteGrid>
                        <NoteCard>
                            <h4>Chris's notecard</h4>
                            <p>What Oliver could do to deal with his problems:</p>
                            <p>He can take a gap year to gain some life skills. He can attend some extra tutorial classes. He can also join a study group.</p>
                            <p>What kind of support he needs:</p>
                            <p>I think he needs more support from his parents, friends and tutors. They should perhaps talk to him and persuade him to develop better learning habits.</p>
                        </NoteCard>
                        <NoteCard>
                            <h4>Amy's notecard</h4>
                            <p>To deal w/ probs, he could:</p>
                            <ul>
                                <li>ask for more guidance from tutors + professors</li>
                                <li>join study grps to meet other sts</li>
                                <li>change his major (right fit for his talent?)</li>
                            </ul>
                            <p>Support he needs:</p>
                            <ul>
                                <li>better communication w/ tutors</li>
                                <li>develop better study skills</li>
                                <li>identify strengths and weaknesses</li>
                            </ul>
                        </NoteCard>
                    </NoteGrid>
                </Exercise>
                <Table>
                    <thead>
                        <tr><Th>Good note-taking skills for the speaking exam</Th></tr>
                        <tr><Th>Do ...</Th><Th>Don't ...</Th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <Td>use abbreviations</Td>
                            <Td>write full sentences or paragraphs</Td>
                        </tr>
                    </tbody>
                </Table>
                <Exercise>
                    <Instruction><strong>D4</strong> Now make your own set of notes for the Exam practice question on page 13. Think of two points for each discussion point. Refer to Chris's and Amy's notecards for ideas.</Instruction>
                    <NoteGrid>
                        <EmptyNote><p>What Oliver could do</p></EmptyNote>
                        <EmptyNote><p>What kind of support he needs</p></EmptyNote>
                        <EmptyNote><p>How gifted children should develop their strengths and overcome any weaknesses</p></EmptyNote>
                        <EmptyNote><p>Anything else</p></EmptyNote>
                    </NoteGrid>
                    <AIFeatureBox>
                        <h4>Stuck for ideas?</h4>
                        <p>Let AI help you brainstorm for the discussion!</p>
                        <GenerateButton onClick={handleGenerateIdeas} disabled={loading}>
                            {loading ? 'Generating...' : 'Get AI Suggestions ✨'}
                        </GenerateButton>
                        {loading && <LoadingText>Generating ideas, please wait...</LoadingText>}
                        {error && <ErrorMessage>{error}</ErrorMessage>}
                        {aiIdeas && (
                            <ResultsContainer>
                                <h5>AI-Generated Ideas</h5>
                                <ul>
                                    {aiIdeas.split('\n').filter(line => line.trim().startsWith('*') || line.trim().startsWith('-')).map((idea, index) => (
                                        <li key={index}>{idea.replace(/[*-]\s*/, '')}</li>
                                    ))}
                                </ul>
                            </ResultsContainer>
                        )}
                    </AIFeatureBox>
                </Exercise>
                <p>You may want to use these abbreviations:</p>
                <AbbreviationList>
                    <li>library = lib</li>
                    <li>university = uni</li>
                    <li>important = imp</li>
                    <li>problem = prob</li>
                    <li>centre = ctr</li>
                    <li>students = sts</li>
                    <li>group = grp</li>
                    <li>for example = e.g.</li>
                    <li>because = b/c</li>
                    <li>with = w/</li>
                    <li>without = w/o</li>
                    <li>first = 1st</li>
                    <li>question = q</li>
                    <li>and = + or &</li>
                    <li>more than = ></li>
                    <li>less than = <</li>
                    <li>increase = ↑</li>
                    <li>decrease = ↓</li>
                </AbbreviationList>
                <RememberBox>
                    <h4>Remember</h4>
                    <p>To speak freely during the Group Interaction:</p>
                    <ul>
                        <li>Spend some time <strong>practising your points in your head</strong> during the preparation time.</li>
                        <li><strong>Underline</strong> the keywords on your notecard. Do not write down complete sentences.</li>
                        <li>Keep <strong>eye contact</strong> with other group members. Avoid reading directly from your notes.</li>
                    </ul>
                </RememberBox>
            </Section>

             <Section>
                <h3>Exam practice</h3>
                 <p>In groups of four, complete Part A of the Exam practice on page 13. Use your notes on page 15.</p>
                 <NoteGrid style={{ gridTemplateColumns: '1fr' }}>
                     <EmptyNote>
                         <p>What Oliver could do</p>
                     </EmptyNote>
                     <EmptyNote>
                        <p>What kind of support he needs</p>
                     </EmptyNote>
                     <EmptyNote>
                         <p>How gifted children should develop their strengths and overcome any weaknesses</p>
                     </EmptyNote>
                 </NoteGrid>
            </Section>

        </IdeasContainer>
    );
};

export default IdeasAndOrganization;